import "server-only";
import { one, q } from "../db";
import { newApiKey, type Actor } from "../core/auth";
import { requireOrg, type Role } from "../core/authz";
import { badRequest, notFound } from "../core/errors";
import { recordEvent } from "../core/events";

export async function listApiKeys(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  return q<{ id: string; name: string; key_prefix: string; role: Role; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>(
    `select id, name, key_prefix, role, created_at, last_used_at, revoked_at from api_keys where org_id = $1 order by revoked_at nulls first, created_at desc`,
    [orgId],
  );
}

/** Create a key. The full key is shown once, here, and only its hash is kept. */
export async function createApiKey(actor: Actor, orgId: string, name: string, role: Role) {
  requireOrg(actor, orgId, "org.manage");
  if (!name.trim()) throw badRequest("Name the key after the system that will use it, for example Munch.");
  const k = newApiKey();
  const r = await one<{ id: string }>(
    `insert into api_keys (org_id, name, key_prefix, key_hash, role, created_by) values ($1,$2,$3,$4,$5,$6) returning id`,
    [orgId, name.trim(), k.prefix, k.hash, role, actor.kind === "user" ? actor.userId : null],
  );
  await recordEvent(actor, orgId, "api_key.created", "api_key", r!.id, { name, role });
  return { id: r!.id, key: k.raw };
}

export async function revokeApiKey(actor: Actor, orgId: string, keyId: string) {
  requireOrg(actor, orgId, "org.manage");
  const r = await one(`update api_keys set revoked_at = now() where id = $1 and org_id = $2 and revoked_at is null returning id`, [keyId, orgId]);
  if (!r) throw notFound("That key");
  await recordEvent(actor, orgId, "api_key.revoked", "api_key", keyId);
}

/**
 * The event feed: everything that happened in an organisation, in order.
 * Another system keeps the last id it saw and asks for what came after.
 */
export async function eventFeed(actor: Actor, orgId: string, after: number, limit: number) {
  requireOrg(actor, orgId, "integration.read");
  const rows = await q<{ id: string; type: string; entity_type: string; entity_id: string | null; payload: unknown; created_at: Date }>(
    `select id, type, entity_type, entity_id, payload, created_at from events where org_id = $1 and id > $2 order by id limit $3`,
    [orgId, after, Math.min(Math.max(limit, 1), 500)],
  );
  return { events: rows.map((r) => ({ ...r, id: Number(r.id) })), next_after: rows.length ? Number(rows[rows.length - 1].id) : after };
}
