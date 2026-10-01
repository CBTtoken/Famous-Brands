import { api } from "@/lib/http";
import { listReports } from "@/lib/services/stock";

export const GET = api<{ storeId: string }>(async (req, actor, { storeId }) => ({
  reports: await listReports(actor, storeId, { open: req.nextUrl.searchParams.get("open") === "1" }),
}));
