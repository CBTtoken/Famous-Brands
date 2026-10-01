import "server-only";
import { cookies } from "next/headers";
import type { UserActor } from "./core/auth";
import { roleIn, type Role } from "./core/authz";
import { one } from "./db";

export const ORG_COOKIE = "sos_org";

/** The organisation a page works in: the person's own, or for a platform admin the one they picked. */
export async function pageOrg(actor: UserActor): Promise<{ orgId: string; orgName: string; role: Role } | null> {
  const picked = (await cookies()).get(ORG_COOKIE)?.value;
  if (picked && roleIn(actor, picked)) {
    const o = await one<{ name: string }>(`select name from organisations where id = $1`, [picked]).catch(() => null);
    if (o) return { orgId: picked, orgName: o.name, role: roleIn(actor, picked)! };
  }
  if (actor.orgs.length) return { orgId: actor.orgs[0].orgId, orgName: actor.orgs[0].orgName, role: actor.orgs[0].role };
  if (actor.isPlatformAdmin) {
    const o = await one<{ id: string; name: string }>(`select id, name from organisations order by name limit 1`);
    if (o) return { orgId: o.id, orgName: o.name, role: "admin" };
  }
  return null;
}
