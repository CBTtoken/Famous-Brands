import "server-only";
import { q, type Db, pool } from "../db";
import type { Actor } from "./auth";

/**
 * Write to the event log. This is both the audit trail ("who did what, when")
 * and the feed other systems (Munch, Aura, OPUS) read through the API.
 */
export async function recordEvent(
  actor: Actor | null,
  orgId: string | null,
  type: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
  db: Db = pool,
) {
  await q(
    `insert into events (org_id, actor_user_id, actor_api_key_id, type, entity_type, entity_id, payload)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      orgId,
      actor?.kind === "user" ? actor.userId : null,
      actor?.kind === "api_key" ? actor.keyId : null,
      type,
      entityType,
      entityId,
      JSON.stringify(payload),
    ],
    db,
  );
}
