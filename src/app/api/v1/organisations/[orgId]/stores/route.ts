import { api, json } from "@/lib/http";
import { listStores, saveStore } from "@/lib/services/org";
import { visibleStores } from "@/lib/core/authz";

export const GET = api<{ orgId: string }>(async (req, actor, { orgId }) => {
  if (req.nextUrl.searchParams.get("mine") === "1") return { stores: await visibleStores(actor, orgId) };
  return { stores: await listStores(actor, orgId) };
});
export const POST = api<{ orgId: string }>(async (req, actor, { orgId }) => ({ id: await saveStore(actor, orgId, null, await json(req)) }));
