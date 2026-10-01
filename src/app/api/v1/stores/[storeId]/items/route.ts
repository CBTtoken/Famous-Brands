import { api, json } from "@/lib/http";
import { listStoreItems, saveStoreItem } from "@/lib/services/stock";

export const GET = api<{ storeId: string }>(async (_req, actor, { storeId }) => ({ items: await listStoreItems(actor, storeId) }));
export const POST = api<{ storeId: string }>(async (req, actor, { storeId }) => ({ id: await saveStoreItem(actor, storeId, await json(req)) }));
