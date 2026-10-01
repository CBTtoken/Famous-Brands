import { api, json } from "@/lib/http";
import { saveStore } from "@/lib/services/org";
import { one } from "@/lib/db";
import { notFound } from "@/lib/core/errors";

export const PUT = api<{ storeId: string }>(async (req, actor, { storeId }) => {
  const s = await one<{ org_id: string }>(`select org_id from stores where id = $1`, [storeId]).catch(() => null);
  if (!s) throw notFound("That store");
  return { id: await saveStore(actor, s.org_id, storeId, await json(req)) };
});
