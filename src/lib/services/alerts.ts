import "server-only";
import { after } from "next/server";
import { one, q, tx, type Db, pool } from "../db";
import type { Actor } from "../core/auth";
import { requireOrg, visibleStores, type Role } from "../core/authz";
import { notFound } from "../core/errors";
import { recordEvent } from "../core/events";
import { processNotificationQueue } from "./push";

import type { Tier } from "../core/tiers";

type RaiseInput = {
  orgId: string;
  storeId: string | null;
  tier: Tier | null;
  kind: string;
  title: string;
  body: string;
  sourceType: string;
  sourceId: string;
  link?: string;
  createdBy?: string | null;
};

/**
 * Who should hear about an alert of this tier at this store, per the
 * organisation's notification rules. Role rules reach only people who cover
 * the store (admins cover all). A named-person rule reaches that person.
 */
export async function recipientsFor(orgId: string, storeId: string | null, tier: Tier, db: Db = pool) {
  return q<{ user_id: string; push: boolean }>(
    `with rules as (select * from notification_rules where org_id = $1 and tier = $2)
     select distinct on (u.id) u.id as user_id, r.push
     from rules r
     join memberships m on m.org_id = $1
       and ((r.recipient_user_id is not null and m.user_id = r.recipient_user_id)
         or (r.recipient_role is not null and m.role = r.recipient_role))
     join users u on u.id = m.user_id and u.active
     where r.recipient_user_id is not null
        or m.role = 'admin'
        or $3::uuid is null
        or exists (select 1 from store_assignments a where a.user_id = m.user_id and a.store_id = $3)
     order by u.id, r.push desc`,
    [orgId, tier, storeId],
    db,
  );
}

/**
 * Record an alert and queue a notification for everyone the rules name.
 * Sending happens straight after the response (and again from the queue
 * processor if a send fails), so a slow push service never slows the
 * supervisor's phone.
 */
export async function raiseAlert(input: RaiseInput, db: Db = pool) {
  const alert = await one<{ id: string }>(
    `insert into alerts (org_id, store_id, tier, kind, title, body, source_type, source_id, link, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [input.orgId, input.storeId, input.tier, input.kind, input.title, input.body, input.sourceType, input.sourceId, input.link ?? null, input.createdBy ?? null],
    db,
  );
  let queued = 0;
  if (input.tier) {
    const recipients = await recipientsFor(input.orgId, input.storeId, input.tier, db);
    for (const r of recipients) {
      await q(
        `insert into notifications (alert_id, user_id, channel) values ($1,$2,$3) on conflict do nothing`,
        [alert!.id, r.user_id, r.push ? "push" : "in_app"],
        db,
      );
      queued++;
    }
  }
  await recordEvent(null, input.orgId, "alert.raised", "alert", alert!.id, { tier: input.tier, kind: input.kind, recipients: queued }, db);
  if (queued) scheduleQueueRun();
  return { alertId: alert!.id, queued };
}

/** Run the queue after the current response is sent, where Next.js allows it. */
export function scheduleQueueRun() {
  try {
    after(() => processNotificationQueue().catch((e) => console.error("notification queue", e)));
  } catch {
    // Outside a request (scripts, tests): run now, do not wait.
    void processNotificationQueue().catch((e) => console.error("notification queue", e));
  }
}

export async function listAlerts(actor: Actor, orgId: string, opts: { open?: boolean; storeId?: string; limit?: number } = {}) {
  requireOrg(actor, orgId, "alerts.view");
  const stores = await visibleStores(actor, orgId);
  const ids = stores.map((s) => s.id);
  return q<{
    id: string; store_id: string | null; store_name: string | null; tier: Tier | null; kind: string; title: string; body: string;
    link: string | null; created_at: Date; acknowledged_at: Date | null; acknowledged_by_name: string | null;
    sent: number; no_device: number; failed: number; queued: number;
  }>(
    `select a.id, a.store_id, s.name as store_name, a.tier, a.kind, a.title, a.body, a.link, a.created_at,
            a.acknowledged_at, u.full_name as acknowledged_by_name,
            count(n.*) filter (where n.status = 'sent')::int as sent,
            count(n.*) filter (where n.status = 'no_device')::int as no_device,
            count(n.*) filter (where n.status = 'failed')::int as failed,
            count(n.*) filter (where n.status = 'queued')::int as queued
     from alerts a
     left join stores s on s.id = a.store_id
     left join users u on u.id = a.acknowledged_by
     left join notifications n on n.alert_id = a.id
     where a.org_id = $1 and (a.store_id is null or a.store_id = any($2::uuid[]))
       and ($3::boolean is not true or a.acknowledged_at is null)
       and ($4::uuid is null or a.store_id = $4)
     group by a.id, s.name, u.full_name
     order by a.acknowledged_at is null desc, a.created_at desc
     limit $5`,
    [orgId, ids, opts.open ?? false, opts.storeId ?? null, opts.limit ?? 100],
  );
}

export async function alertDeliveries(actor: Actor, alertId: string) {
  const a = await one<{ org_id: string; store_id: string | null }>(`select org_id, store_id from alerts where id = $1`, [alertId]);
  if (!a) throw notFound("That alert");
  requireOrg(actor, a.org_id, "alerts.view");
  if (a.store_id) {
    const stores = await visibleStores(actor, a.org_id);
    if (!stores.some((s) => s.id === a.store_id)) throw notFound("That alert");
  }
  return q<{ full_name: string; channel: string; status: string; sent_at: Date | null; last_error: string | null; attempts: number; deliveries: { ok: boolean; status_code: number | null; created_at: string }[] }>(
    `select u.full_name, n.channel, n.status, n.sent_at, n.last_error, n.attempts,
            coalesce(json_agg(json_build_object('ok', d.ok, 'status_code', d.status_code, 'created_at', d.created_at)
              order by d.created_at) filter (where d.id is not null), '[]') as deliveries
     from notifications n join users u on u.id = n.user_id
     left join push_deliveries d on d.notification_id = n.id
     where n.alert_id = $1 group by n.id, u.full_name order by u.full_name`,
    [alertId],
  );
}

export async function acknowledgeAlert(actor: Actor, alertId: string) {
  const a = await one<{ org_id: string; store_id: string | null }>(`select org_id, store_id from alerts where id = $1`, [alertId]);
  if (!a) throw notFound("That alert");
  requireOrg(actor, a.org_id, "alerts.acknowledge");
  if (a.store_id) {
    const stores = await visibleStores(actor, a.org_id);
    if (!stores.some((s) => s.id === a.store_id)) throw notFound("That alert");
  }
  const userId = actor.kind === "user" ? actor.userId : null;
  await q(`update alerts set acknowledged_at = now(), acknowledged_by = $2 where id = $1 and acknowledged_at is null`, [alertId, userId]);
  await recordEvent(actor, a.org_id, "alert.acknowledged", "alert", alertId);
}

// ---- notification rules -----------------------------------------------------

export async function getNotificationRules(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  return q<{ id: string; tier: Tier; recipient_role: Role | null; recipient_user_id: string | null; full_name: string | null; push: boolean }>(
    `select r.id, r.tier, r.recipient_role, r.recipient_user_id, u.full_name, r.push
     from notification_rules r left join users u on u.id = r.recipient_user_id
     where r.org_id = $1 order by r.tier, r.recipient_role nulls last, u.full_name`,
    [orgId],
  );
}

export type RuleInput = { tier: Tier; recipient_role?: Role | null; recipient_user_id?: string | null; push: boolean };

/** Replace the organisation's rules in one go, as the admin screen saves them. */
export async function setNotificationRules(actor: Actor, orgId: string, rules: RuleInput[]) {
  requireOrg(actor, orgId, "org.manage");
  return tx((db) => saveRules(actor, orgId, rules, db));
}

async function saveRules(actor: Actor, orgId: string, rules: RuleInput[], db: Db) {
  // Serialise saves for this group so two admins saving at once cannot double up.
  await q(`select id from organisations where id = $1 for update`, [orgId], db);
  for (const r of rules) {
    if (r.recipient_user_id) {
      const m = await one(`select 1 from memberships where org_id = $1 and user_id = $2`, [orgId, r.recipient_user_id], db);
      if (!m) throw notFound("That person");
    }
  }
  await q(`delete from notification_rules where org_id = $1`, [orgId], db);
  for (const r of rules) {
    await q(
      `insert into notification_rules (org_id, tier, recipient_role, recipient_user_id, push) values ($1,$2,$3,$4,$5)`,
      [orgId, r.tier, r.recipient_user_id ? null : r.recipient_role ?? null, r.recipient_user_id ?? null, r.push],
      db,
    );
  }
  await recordEvent(actor, orgId, "notification_rules.updated", "organisation", orgId, { count: rules.length }, db);
}

export async function setAlertTiers(
  actor: Actor,
  orgId: string,
  t: { checkin_mismatch_tier: Tier | null; stock_broken_tier: Tier | null; stock_stolen_tier: Tier | null; stock_worn_tier: Tier | null },
) {
  requireOrg(actor, orgId, "org.manage");
  await q(
    `update organisations set checkin_mismatch_tier = $2, stock_broken_tier = $3, stock_stolen_tier = $4, stock_worn_tier = $5 where id = $1`,
    [orgId, t.checkin_mismatch_tier, t.stock_broken_tier, t.stock_stolen_tier, t.stock_worn_tier],
  );
  await recordEvent(actor, orgId, "alert_tiers.updated", "organisation", orgId, t);
}
