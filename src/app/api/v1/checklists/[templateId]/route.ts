import { api, json } from "@/lib/http";
import { getTemplate, saveTemplate } from "@/lib/services/templates";

export const GET = api<{ templateId: string }>(async (_req, actor, { templateId }) => getTemplate(actor, templateId));
export const PUT = api<{ templateId: string }>(async (req, actor, { templateId }) => {
  const t = await getTemplate(actor, templateId);
  return { id: await saveTemplate(actor, t.org_id, templateId, await json(req)) };
});
