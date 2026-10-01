import { z } from "zod";
import { api, json } from "@/lib/http";
import { setAlertTiers } from "@/lib/services/alerts";

const t = z.enum(["critical", "urgent", "important", "be_aware"]).nullable();
const input = z.object({ checkin_mismatch_tier: t, stock_broken_tier: t, stock_stolen_tier: t, stock_worn_tier: t });
export const PUT = api<{ orgId: string }>(async (req, actor, { orgId }) => {
  await setAlertTiers(actor, orgId, input.parse(await json(req)));
  return { ok: true };
});
