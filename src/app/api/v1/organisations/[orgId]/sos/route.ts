import { api } from "@/lib/http";
import { parseRange, sos } from "@/lib/services/reports";

export const GET = api<{ orgId: string }>(async (req, actor, { orgId }) => {
  const sp = req.nextUrl.searchParams;
  return sos(actor, orgId, parseRange(sp.get("from"), sp.get("to")), sp.get("store"));
});
