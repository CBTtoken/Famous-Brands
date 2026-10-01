import "server-only";
import { z } from "zod";
import { one, q, tx } from "../db";
import { destroyUserSessions, hashPassword, normalisePhone, verifyPassword, type Actor } from "../core/auth";
import { actorUserId, requireOrg, roleIn, type Role, type StoreRow } from "../core/authz";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import { recordEvent } from "../core/events";

const roleEnum = z.enum(["admin", "area_manager", "shop_manager", "supervisor"]);

// ---- organisations ----------------------------------------------------------

export async function createOrganisation(actor: Actor, name: string) {
  if (actor.kind !== "user" || !actor.isPlatformAdmin) throw forbidden("Only a platform admin can add an organisation.");
  if (!name.trim()) throw badRequest("Give the organisation a name.");
  const o = await one<{ id: string }>(`insert into organisations (name) values ($1) returning id`, [name.trim()]);
  await recordEvent(actor, o!.id, "organisation.created", "organisation", o!.id, { name });
  return o!.id;
}

export async function listOrganisations(actor: Actor) {
  if (actor.kind === "user" && actor.isPlatformAdmin) {
    return q<{ id: string; name: string }>(`select id, name from organisations order by name`);
  }
  if (actor.kind === "api_key") return q<{ id: string; name: string }>(`select id, name from organisations where id = $1`, [actor.orgId]);
  return actor.orgs.map((o) => ({ id: o.orgId, name: o.orgName }));
}

export async function getOrganisation(actor: Actor, orgId: string) {
  if (!roleIn(actor, orgId)) throw notFound("That organisation");
  return one<{
    id: string; name: string;
    checkin_mismatch_tier: string | null; stock_broken_tier: string | null; stock_stolen_tier: string | null; stock_worn_tier: string | null;
  }>(`select * from organisations where id = $1`, [orgId]);
}

// ---- stores -----------------------------------------------------------------

export const storeInput = z.object({
  name: z.string().trim().min(1, "Give the store a name"),
  brand: z.string().trim().max(80).nullish(),
  address: z.string().trim().max(300).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  geofence_m: z.number().int().min(25).max(5000).default(150),
  known_ips: z.array(z.string().trim().min(3).max(64)).default([]),
  checkin_mode: z.enum(["flag", "block"]).default("flag"),
  active: z.boolean().default(true),
});

export async function listStores(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  return q<StoreRow & { people: number }>(
    `select s.*, (select count(*)::int from store_assignments a where a.store_id = s.id) as people
     from stores s where s.org_id = $1 order by s.active desc, s.name`,
    [orgId],
  );
}

export async function saveStore(actor: Actor, orgId: string, storeId: string | null, input: z.input<typeof storeInput>) {
  requireOrg(actor, orgId, "org.manage");
  const s = storeInput.parse(input);
  if ((s.latitude == null) !== (s.longitude == null)) throw badRequest("Give both latitude and longitude, or neither.");
  try {
    if (storeId) {
      const r = await one<{ id: string }>(
        `update stores set name=$3, brand=$4, address=$5, latitude=$6, longitude=$7, geofence_m=$8, known_ips=$9, checkin_mode=$10, active=$11
         where id=$1 and org_id=$2 returning id`,
        [storeId, orgId, s.name, s.brand ?? null, s.address ?? null, s.latitude ?? null, s.longitude ?? null, s.geofence_m, s.known_ips, s.checkin_mode, s.active],
      );
      if (!r) throw notFound("That store");
      await recordEvent(actor, orgId, "store.updated", "store", storeId, s);
      return storeId;
    }
    const r = await one<{ id: string }>(
      `insert into stores (org_id, name, brand, address, latitude, longitude, geofence_m, known_ips, checkin_mode, active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [orgId, s.name, s.brand ?? null, s.address ?? null, s.latitude ?? null, s.longitude ?? null, s.geofence_m, s.known_ips, s.checkin_mode, s.active],
    );
    await recordEvent(actor, orgId, "store.created", "store", r!.id, s);
    return r!.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw conflict("There is already a store with that name.");
    throw e;
  }
}

// ---- people -----------------------------------------------------------------

export const personInput = z.object({
  full_name: z.string().trim().min(2, "Give their full name"),
  email: z.string().trim().toLowerCase().email("That email address does not look right").nullish().or(z.literal("").transform(() => null)),
  phone: z.string().trim().nullish(),
  role: roleEnum,
  password: z.string().min(8, "The password needs at least 8 characters").optional(),
  active: z.boolean().default(true),
});

export type PersonRow = {
  id: string; full_name: string; email: string | null; phone: string | null; role: Role; active: boolean;
  must_change_password: boolean; stores: { store_id: string; name: string; can_order: boolean }[];
};

export async function listPeople(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  return q<PersonRow>(
    `select u.id, u.full_name, u.email, u.phone, m.role, u.active, u.must_change_password,
       coalesce(json_agg(json_build_object('store_id', s.id, 'name', s.name, 'can_order', a.can_order) order by s.name)
         filter (where s.id is not null), '[]') as stores
     from memberships m join users u on u.id = m.user_id
     left join store_assignments a on a.user_id = u.id
     left join stores s on s.id = a.store_id and s.org_id = m.org_id
     where m.org_id = $1 group by u.id, m.role order by u.active desc, u.full_name`,
    [orgId],
  );
}

function cleanPhone(raw: string | null | undefined) {
  if (!raw) return null;
  const p = normalisePhone(raw);
  if (!p) throw badRequest("That phone number does not look right. Use 10 digits, like 082 123 4567.");
  return p;
}

export async function createPerson(actor: Actor, orgId: string, input: z.input<typeof personInput>) {
  requireOrg(actor, orgId, "org.manage");
  const p = personInput.parse(input);
  const phone = cleanPhone(p.phone);
  if (!p.email && !phone) throw badRequest("Give an email address or a phone number, so they can sign in.");
  if (!p.password) throw badRequest("Set a first password for them. They will be asked to change it.");
  if (p.role === "admin" && actor.kind === "user" && roleIn(actor, orgId) !== "admin") throw forbidden();
  return tx(async (c) => {
    const existing = await one<{ id: string }>(
      `select id from users where ($1::citext is not null and email = $1) or ($2::text is not null and phone = $2)`,
      [p.email ?? null, phone],
      c,
    );
    if (existing) throw conflict("Somebody already has that email address or phone number.");
    const u = await one<{ id: string }>(
      `insert into users (full_name, email, phone, password_hash, must_change_password) values ($1,$2,$3,$4,true) returning id`,
      [p.full_name, p.email ?? null, phone, await hashPassword(p.password!)],
      c,
    );
    await q(`insert into memberships (org_id, user_id, role) values ($1,$2,$3)`, [orgId, u!.id, p.role], c);
    await recordEvent(actor, orgId, "person.created", "user", u!.id, { role: p.role }, c);
    return u!.id;
  });
}

export async function updatePerson(
  actor: Actor,
  orgId: string,
  userId: string,
  input: { full_name?: string; email?: string | null; phone?: string | null; role?: Role; active?: boolean },
) {
  requireOrg(actor, orgId, "org.manage");
  const m = await one(`select 1 from memberships where org_id = $1 and user_id = $2`, [orgId, userId]);
  if (!m) throw notFound("That person");
  if (actor.kind === "user" && actor.userId === userId && (input.active === false || (input.role && input.role !== "admin"))) {
    throw badRequest("You cannot remove your own admin access. Ask another admin.");
  }
  const phone = input.phone === undefined ? undefined : cleanPhone(input.phone);
  try {
    await q(
      `update users set full_name = coalesce($2, full_name),
         email = case when $3::boolean then $4::citext else email end,
         phone = case when $5::boolean then $6 else phone end,
         active = coalesce($7, active)
       where id = $1`,
      [userId, input.full_name?.trim() || null, input.email !== undefined, input.email || null, phone !== undefined, phone ?? null, input.active ?? null],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw conflict("Somebody already has that email address or phone number.");
    if ((e as { code?: string }).code === "23514") throw badRequest("Keep at least an email address or a phone number.");
    throw e;
  }
  if (input.role) await q(`update memberships set role = $3 where org_id = $1 and user_id = $2`, [orgId, userId, input.role]);
  if (input.active === false) await destroyUserSessions(userId);
  await recordEvent(actor, orgId, "person.updated", "user", userId, { ...input, phone: phone ?? undefined });
}

/** Replace which stores a person covers, and whether they may approve orders there. */
export async function setAssignments(actor: Actor, orgId: string, userId: string, assignments: { store_id: string; can_order: boolean }[]) {
  requireOrg(actor, orgId, "org.manage");
  const m = await one(`select 1 from memberships where org_id = $1 and user_id = $2`, [orgId, userId]);
  if (!m) throw notFound("That person");
  const ids = assignments.map((a) => a.store_id);
  const valid = await q<{ id: string }>(`select id from stores where org_id = $1 and id = any($2::uuid[])`, [orgId, ids]);
  if (valid.length !== new Set(ids).size) throw notFound("One of those stores");
  await tx(async (c) => {
    await q(
      `delete from store_assignments a using stores s where a.store_id = s.id and s.org_id = $1 and a.user_id = $2`,
      [orgId, userId],
      c,
    );
    for (const a of assignments) {
      await q(`insert into store_assignments (user_id, store_id, can_order) values ($1,$2,$3)`, [userId, a.store_id, a.can_order], c);
    }
    await recordEvent(actor, orgId, "person.assignments_set", "user", userId, { assignments }, c);
  });
}

export async function adminResetPassword(actor: Actor, orgId: string, userId: string, password: string) {
  requireOrg(actor, orgId, "org.manage");
  if (password.length < 8) throw badRequest("The password needs at least 8 characters.");
  const m = await one(`select 1 from memberships where org_id = $1 and user_id = $2`, [orgId, userId]);
  if (!m) throw notFound("That person");
  await q(`update users set password_hash = $2, must_change_password = true where id = $1`, [userId, await hashPassword(password)]);
  await destroyUserSessions(userId);
  await recordEvent(actor, orgId, "person.password_reset", "user", userId);
}

export async function changeOwnPassword(actor: Actor, current: string, next: string) {
  const userId = actorUserId(actor);
  if (next.length < 8) throw badRequest("Your new password needs at least 8 characters.");
  if (next === current) throw badRequest("Choose a password that is different from the old one.");
  const u = await one<{ password_hash: string }>(`select password_hash from users where id = $1`, [userId]);
  if (!u || !(await verifyPassword(u.password_hash, current))) throw badRequest("Your current password is not right.");
  await q(`update users set password_hash = $2, must_change_password = false where id = $1`, [userId, await hashPassword(next)]);
  await recordEvent(actor, null, "person.password_changed", "user", userId);
}
