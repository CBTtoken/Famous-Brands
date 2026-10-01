import { z } from "zod";
import { api, json } from "@/lib/http";
import { setTemplateStatus } from "@/lib/services/templates";

export const POST = api<{ templateId: string }>(async (req, actor, { templateId }) => {
  const { status } = z.object({ status: z.enum(["draft", "published", "retired"]) }).parse(await json(req));
  await setTemplateStatus(actor, templateId, status);
  return { ok: true };
});
