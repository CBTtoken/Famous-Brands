import { api } from "@/lib/http";
import { dueChecklists } from "@/lib/services/runs";

export const GET = api<{ visitId: string }>(async (_req, actor, { visitId }) => ({ checklists: await dueChecklists(actor, visitId) }));
