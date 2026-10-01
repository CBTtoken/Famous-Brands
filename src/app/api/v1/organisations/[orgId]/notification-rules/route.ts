import { z } from "zod";
import { api, json } from "@/lib/http";
import { getNotificationRules, setNotificationRules } from "@/lib/services/alerts";

const rule = z.object({
  tier: z.enum(["critical", "urgent", "important", "be_aware"]),
  recipient_role: z.enum(["admin", "area_manager", "shop_manager", "supervisor"]).nullish(),
  recipient_user_id: z.string().uuid().nullish(),
  push: z.boolean().default(true),
}).refine((r) => !!r.recipient_role !== !!r.recipient_user_id, { message: "Each rule needs a role or a person, not both" });

export const GET = api<{ orgId: string }>(async (_req, actor, { orgId }) => ({ rules: await getNotificationRules(actor, orgId) }));
export const PUT = api<{ orgId: string }>(async (req, actor, { orgId }) => {
  const { rules } = z.object({ rules: z.array(rule).max(100) }).parse(await json(req));
  await setNotificationRules(actor, orgId, rules);
  return { ok: true, saved: rules.length };
});
