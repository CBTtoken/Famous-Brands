import { api, json } from "@/lib/http";
import { listTemplates, saveTemplate } from "@/lib/services/templates";

export const GET = api<{ orgId: string }>(async (_req, actor, { orgId }) => ({ checklists: await listTemplates(actor, orgId) }));
export const POST = api<{ orgId: string }>(async (req, actor, { orgId }) => ({ id: await saveTemplate(actor, orgId, null, await json(req)) }));
