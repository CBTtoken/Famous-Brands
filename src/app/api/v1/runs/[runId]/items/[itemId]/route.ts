import { api, json } from "@/lib/http";
import { saveAnswer } from "@/lib/services/runs";

export const PUT = api<{ runId: string; itemId: string }>(async (req, actor, { runId, itemId }) => saveAnswer(actor, runId, itemId, await json(req)));
