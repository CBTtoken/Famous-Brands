import { api } from "@/lib/http";
import { activeVisit } from "@/lib/services/visits";

export const GET = api(async (_req, actor) => {
  if (actor.kind === "api_key") return { kind: "api_key", name: actor.name, org_id: actor.orgId, role: actor.role };
  return {
    kind: "user", id: actor.userId, name: actor.name, is_platform_admin: actor.isPlatformAdmin,
    must_change_password: actor.mustChangePassword, organisations: actor.orgs, active_visit: await activeVisit(actor),
  };
}, { allowBeforePasswordChange: true });
