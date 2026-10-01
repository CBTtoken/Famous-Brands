import "server-only";
import { one, q, type Db, pool } from "../db";
import type { Actor } from "./auth";
import { forbidden, notFound, unauthenticated } from "./errors";

export type Role = "admin" | "area_manager" | "shop_manager" | "supervisor";

export const roleLabel: Record<Role, string> = {
  admin: "Admin",
  area_manager: "Area manager",
  shop_manager: "Shop manager",
  supervisor: "Shop floor supervisor",
};

/**
 * The permission model, in one place. Every API route and every page asks
 * this module, so a role cannot do through the API what the screen hides.
 */
export type Action =
  | "org.manage" // people, stores, checklists, notification rules, suppliers, catalogue, API keys
  | "reports.view" // reports and the S.O.S screen for the stores they cover
  | "alerts.view"
  | "alerts.acknowledge"
  | "visit.checkin" // check in at a store and do checklists
  | "stock.view"
  | "stock.manage" // shop item list, starter list, resolve a report
  | "stock.report" // report an item broken, stolen or worn
  | "integration.read"; // read the event feed

const matrix: Record<Role, Action[]> = {
  admin: ["org.manage", "reports.view", "alerts.view", "alerts.acknowledge", "visit.checkin", "stock.view", "stock.manage", "stock.report", "integration.read"],
  area_manager: ["reports.view", "alerts.view", "alerts.acknowledge", "visit.checkin", "stock.view", "stock.manage", "stock.report"],
  shop_manager: ["reports.view", "alerts.view", "alerts.acknowledge", "visit.checkin", "stock.view", "stock.manage", "stock.report"],
  supervisor: ["visit.checkin", "stock.view", "stock.report"],
};

export function roleCan(role: Role, action: Action) {
  return matrix[role].includes(action);
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw unauthenticated();
  return actor;
}

/** The actor's role inside an organisation, or null if they have none. */
export function roleIn(actor: Actor, orgId: string): Role | null {
  if (actor.kind === "api_key") return actor.orgId === orgId ? actor.role : null;
  if (actor.isPlatformAdmin) return "admin";
  return actor.orgs.find((o) => o.orgId === orgId)?.role ?? null;
}

export function requireOrg(actor: Actor, orgId: string, action: Action): Role {
  const role = roleIn(actor, orgId);
  if (!role) throw notFound("That organisation");
  if (!roleCan(role, action)) throw forbidden();
  return role;
}

/** The organisation a request acts on: the only one the person belongs to, or the one asked for. */
export function defaultOrgId(actor: Actor, requested?: string | null): string {
  if (actor.kind === "api_key") return actor.orgId;
  if (requested) return requested;
  if (actor.orgs.length >= 1) return actor.orgs[0].orgId;
  throw forbidden("You are not part of any organisation yet. Ask your admin to add you.");
}

export type StoreRow = {
  id: string;
  org_id: string;
  name: string;
  brand: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_m: number;
  known_ips: string[];
  checkin_mode: "flag" | "block";
  active: boolean;
};

export type StoreAccess = { store: StoreRow; role: Role; canOrder: boolean };

/**
 * Can this actor act on this store? Admins (and API keys) cover every store
 * in their organisation; everybody else only the stores assigned to them.
 * A store outside their reach reads as "not found", not "forbidden", so the
 * answer never confirms that somebody else's store exists.
 */
export async function requireStore(actor: Actor, storeId: string, action: Action, db: Db = pool): Promise<StoreAccess> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) throw notFound("That store");
  const store = await one<StoreRow>(`select * from stores where id = $1`, [storeId], db);
  if (!store) throw notFound("That store");
  const role = roleIn(actor, store.org_id);
  if (!role) throw notFound("That store");
  let canOrder = role === "admin";
  if (role !== "admin" && actor.kind === "user") {
    const a = await one<{ can_order: boolean }>(
      `select can_order from store_assignments where user_id = $1 and store_id = $2`,
      [actor.userId, storeId],
      db,
    );
    if (!a) throw notFound("That store");
    canOrder = a.can_order;
  }
  if (!roleCan(role, action)) throw forbidden();
  return { store, role, canOrder };
}

/** Every store the actor can see in an organisation. */
export async function visibleStores(actor: Actor, orgId: string): Promise<(StoreRow & { can_order: boolean })[]> {
  const role = roleIn(actor, orgId);
  if (!role) return [];
  if (role === "admin" || actor.kind === "api_key") {
    return q(`select s.*, true as can_order from stores s where s.org_id = $1 order by s.active desc, s.name`, [orgId]);
  }
  return q(
    `select s.*, a.can_order from stores s join store_assignments a on a.store_id = s.id
     where s.org_id = $1 and a.user_id = $2 order by s.active desc, s.name`,
    [orgId, actor.userId],
  );
}

export function actorUserId(actor: Actor): string {
  if (actor.kind !== "user") throw forbidden("This needs a signed-in person, not an API key.");
  return actor.userId;
}
