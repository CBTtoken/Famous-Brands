import { api } from "@/lib/http";
import { defaultOrgId } from "@/lib/core/authz";
import { listAlerts } from "@/lib/services/alerts";

export const GET = api(async (req, actor) => {
  const sp = req.nextUrl.searchParams;
  const orgId = defaultOrgId(actor, sp.get("org"));
  return { alerts: await listAlerts(actor, orgId, { open: sp.get("open") === "1", storeId: sp.get("store") ?? undefined }) };
});
