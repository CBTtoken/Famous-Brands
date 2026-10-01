import "server-only";
import { z } from "zod";
import { one, q, tx } from "../db";
import type { Actor } from "../core/auth";
import { actorUserId, requireStore } from "../core/authz";
import { badRequest, forbidden, notFound } from "../core/errors";
import { recordEvent } from "../core/events";
import { checkIp, checkLocation, type GeoFix, type IpCheck, type LocationCheck } from "../core/geo";
import { raiseAlert } from "./alerts";
import type { Tier } from "../core/tiers";

export const geoInput = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy_m: z.number().min(0).max(100000).nullish(),
  })
  .nullish();

export const checkInInput = z.object({
  store_id: z.string().uuid(),
  geo: geoInput,
  client_time: z.string().datetime({ offset: true }).nullish(),
  // Her own words on why the checks did not match, when they did not.
  reason: z.string().trim().max(500).nullish(),
});

const toFix = (g: z.infer<typeof geoInput>): GeoFix => (g ? { lat: g.lat, lng: g.lng, accuracyM: g.accuracy_m ?? null } : null);

export const locationText: Record<LocationCheck, string> = {
  ok: "At the store",
  outside: "Away from the store",
  no_fix: "Location not shared",
  store_has_no_location: "Store location not set",
};
export const ipText: Record<IpCheck, string> = {
  match: "On the store connection",
  mismatch: "Not on the store connection",
  store_has_no_ip: "Store connection not set",
};

const isMismatch = (l: LocationCheck, ip: IpCheck) => l === "outside" || l === "no_fix" || ip === "mismatch";

// A visit left open longer than this no longer counts as "checked in".
const STALE_HOURS = 18;

export type VisitRow = {
  id: string; org_id: string; store_id: string; store_name: string; user_id: string; started_at: Date; ended_at: Date | null;
  start_location_check: LocationCheck; start_ip_check: IpCheck; start_distance_m: number | null; mismatch_reason: string | null;
};

export async function activeVisit(actor: Actor): Promise<VisitRow | null> {
  if (actor.kind !== "user") return null;
  return one<VisitRow>(
    `select v.*, s.name as store_name from visits v join stores s on s.id = v.store_id
     where v.user_id = $1 and v.ended_at is null and v.started_at > now() - ($2 || ' hours')::interval
     order by v.started_at desc limit 1`,
    [actor.userId, STALE_HOURS],
  );
}

export async function getVisit(actor: Actor, visitId: string) {
  const v = await one<VisitRow>(
    `select v.*, s.name as store_name from visits v join stores s on s.id = v.store_id where v.id = $1`,
    [visitId],
  );
  if (!v) throw notFound("That visit");
  await requireStore(actor, v.store_id, "visit.checkin");
  if (actor.kind === "user" && v.user_id !== actor.userId) throw notFound("That visit");
  return v;
}

/**
 * Check in at a store: the geo-timestamp of the shift starting. Location and
 * connection are compared with what admin set for the store. A mismatch
 * never stops her working (unless admin switched that store to block); she
 * gives a reason and the mismatch is alerted.
 */
export async function checkIn(actor: Actor, input: z.input<typeof checkInInput>, ip: string | null) {
  const userId = actorUserId(actor);
  const i = checkInInput.parse(input);
  const { store } = await requireStore(actor, i.store_id, "visit.checkin");
  if (!store.active) throw badRequest(`${store.name} is not active. Ask your admin.`);
  const loc = checkLocation(store, toFix(i.geo));
  const ipc = checkIp(store, ip);
  const mismatch = isMismatch(loc.result, ipc);
  const checks = { location: loc.result, distance_m: loc.distanceM, ip: ipc, mismatch };

  if (mismatch && store.checkin_mode === "block") {
    throw forbidden(`We cannot confirm you are at ${store.name}, and this store does not allow check-in without that. Phone your manager.`);
  }
  if (mismatch && !i.reason) {
    return { status: "needs_reason" as const, store_name: store.name, checks };
  }

  const visit = await tx(async (c) => {
    // Only one open visit per person. A forgotten check-out is closed here,
    // marked as such, rather than left open forever.
    const open = await q<{ id: string; store_id: string }>(
      `select id, store_id from visits where user_id = $1 and ended_at is null`,
      [userId],
      c,
    );
    for (const o of open) {
      await q(`update visits set ended_at = now(), end_location_check = 'not_checked_out' where id = $1`, [o.id], c);
      await recordEvent(actor, store.org_id, "visit.auto_closed", "visit", o.id, {}, c);
    }
    const v = await one<{ id: string }>(
      `insert into visits (org_id, store_id, user_id, client_started_at, start_lat, start_lng, start_accuracy_m, start_ip,
         start_location_check, start_ip_check, start_distance_m, mismatch_reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [store.org_id, store.id, userId, i.client_time ?? null, i.geo?.lat ?? null, i.geo?.lng ?? null, i.geo?.accuracy_m ?? null,
        ip, loc.result, ipc, loc.distanceM, mismatch ? i.reason : null],
      c,
    );
    await recordEvent(actor, store.org_id, "visit.checked_in", "visit", v!.id, { store_id: store.id, ...checks }, c);
    return v!;
  });

  if (mismatch) {
    const org = await one<{ checkin_mismatch_tier: Tier | null }>(`select checkin_mismatch_tier from organisations where id = $1`, [store.org_id]);
    const who = actor.kind === "user" ? actor.name : "Someone";
    const parts = [locationText[loc.result] + (loc.distanceM != null ? ` (${loc.distanceM} m)` : ""), ipText[ipc]];
    await raiseAlert({
      orgId: store.org_id,
      storeId: store.id,
      tier: org?.checkin_mismatch_tier ?? null,
      kind: "checkin_mismatch",
      title: `Check-in could not be confirmed`,
      body: `${who} checked in at ${store.name}. ${parts.join(". ")}. Reason given: "${i.reason}"`,
      sourceType: "visit",
      sourceId: visit.id,
      link: `/reports/visits/${visit.id}`,
      createdBy: userId,
    });
  }
  return { status: "checked_in" as const, visit_id: visit.id, store_name: store.name, checks };
}

export async function checkOut(actor: Actor, visitId: string, input: { geo?: z.input<typeof geoInput>; client_time?: string | null }, ip: string | null) {
  const v = await getVisit(actor, visitId);
  if (v.ended_at) return { already: true };
  const store = (await requireStore(actor, v.store_id, "visit.checkin")).store;
  const geo = geoInput.parse(input.geo ?? null);
  const loc = checkLocation(store, toFix(geo));
  const ipc = checkIp(store, ip);
  await q(
    `update visits set ended_at = now(), client_ended_at = $2, end_lat = $3, end_lng = $4, end_accuracy_m = $5, end_ip = $6,
       end_location_check = $7, end_ip_check = $8, end_distance_m = $9 where id = $1`,
    [visitId, input.client_time ?? null, geo?.lat ?? null, geo?.lng ?? null, geo?.accuracy_m ?? null, ip, loc.result, ipc, loc.distanceM],
  );
  await recordEvent(actor, v.org_id, "visit.checked_out", "visit", visitId, { location: loc.result, distance_m: loc.distanceM, ip: ipc });
  return { already: false, checks: { location: loc.result, ip: ipc } };
}
