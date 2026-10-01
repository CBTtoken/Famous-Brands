import { api } from "@/lib/http";
import { getRun } from "@/lib/services/runs";

export const GET = api<{ runId: string }>(async (_req, actor, { runId }) => getRun(actor, runId));
