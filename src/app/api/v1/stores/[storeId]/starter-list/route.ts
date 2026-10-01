import { z } from "zod";
import { api, json } from "@/lib/http";
import { applyStarterList } from "@/lib/services/stock";

export const POST = api<{ storeId: string }>(async (req, actor, { storeId }) => {
  const { suggest_order } = z.object({ suggest_order: z.boolean().default(false) }).parse(await json(req));
  return applyStarterList(actor, storeId, { suggestOrder: suggest_order });
});
