import { api, json } from "@/lib/http";
import { listSuppliers, saveSupplier } from "@/lib/services/stock";

export const GET = api<{ orgId: string }>(async (_req, actor, { orgId }) => ({ suppliers: await listSuppliers(actor, orgId) }));
export const POST = api<{ orgId: string }>(async (req, actor, { orgId }) => ({ id: await saveSupplier(actor, orgId, null, await json(req)) }));
