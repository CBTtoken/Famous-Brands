import { api } from "@/lib/http";
import { acknowledgeAlert } from "@/lib/services/alerts";

export const POST = api<{ alertId: string }>(async (_req, actor, { alertId }) => {
  await acknowledgeAlert(actor, alertId);
  return { ok: true };
});
