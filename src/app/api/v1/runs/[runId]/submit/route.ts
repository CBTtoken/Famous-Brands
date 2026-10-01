import { api } from "@/lib/http";
import { submitRun } from "@/lib/services/runs";

export const POST = api<{ runId: string }>(async (_req, actor, { runId }) => submitRun(actor, runId));
