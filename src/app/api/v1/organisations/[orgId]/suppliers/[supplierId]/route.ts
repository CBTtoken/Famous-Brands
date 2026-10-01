import { api, json } from "@/lib/http";
import { saveSupplier } from "@/lib/services/stock";

export const PUT = api<{ orgId: string; supplierId: string }>(async (req, actor, { orgId, supplierId }) => ({ id: await saveSupplier(actor, orgId, supplierId, await json(req)) }));
