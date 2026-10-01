import { z } from "zod";
import { api, json } from "@/lib/http";
import { resolveReport } from "@/lib/services/stock";

export const POST = api<{ reportId: string }>(async (req, actor, { reportId }) => {
  const { note } = z.object({ note: z.string().max(1000).nullish() }).parse(await json(req));
  await resolveReport(actor, reportId, note ?? null);
  return { ok: true };
});
