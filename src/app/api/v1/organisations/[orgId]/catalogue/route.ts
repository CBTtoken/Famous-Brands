import { api, json } from "@/lib/http";
import { listCatalogue, saveCatalogueItem } from "@/lib/services/stock";

export const GET = api<{ orgId: string }>(async (_req, actor, { orgId }) => ({ items: await listCatalogue(actor, orgId) }));
export const POST = api<{ orgId: string }>(async (req, actor, { orgId }) => ({ id: await saveCatalogueItem(actor, orgId, null, await json(req)) }));
