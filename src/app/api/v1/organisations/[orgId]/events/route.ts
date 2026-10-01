import { api } from "@/lib/http";
import { eventFeed } from "@/lib/services/integration";

export const GET = api<{ orgId: string }>(async (req, actor, { orgId }) => {
  const sp = req.nextUrl.searchParams;
  return eventFeed(actor, orgId, Number(sp.get("after") ?? 0) || 0, Number(sp.get("limit") ?? 100) || 100);
});
