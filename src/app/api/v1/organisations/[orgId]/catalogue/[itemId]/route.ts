import { api, json } from "@/lib/http";
import { saveCatalogueItem } from "@/lib/services/stock";

export const PUT = api<{ orgId: string; itemId: string }>(async (req, actor, { orgId, itemId }) => ({ id: await saveCatalogueItem(actor, orgId, itemId, await json(req)) }));
