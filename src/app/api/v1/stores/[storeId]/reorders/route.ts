import { api } from "@/lib/http";
import { listReorders } from "@/lib/services/stock";

export const GET = api<{ storeId: string }>(async (req, actor, { storeId }) => {
  const s = req.nextUrl.searchParams.get("status");
  return listReorders(actor, storeId, s === "ordered" || s === "dismissed" || s === "all" ? s : "open");
});
