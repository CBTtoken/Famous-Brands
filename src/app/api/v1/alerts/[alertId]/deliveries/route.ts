import { api } from "@/lib/http";
import { alertDeliveries } from "@/lib/services/alerts";

export const GET = api<{ alertId: string }>(async (_req, actor, { alertId }) => ({ deliveries: await alertDeliveries(actor, alertId) }));
