import { z } from "zod";
import { api, json } from "@/lib/http";
import { decideReorder } from "@/lib/services/stock";

export const POST = api<{ reorderId: string }>(async (req, actor, { reorderId }) => {
  const b = z.object({ decision: z.enum(["ordered", "dismissed"]), note: z.string().max(1000).nullish() }).parse(await json(req));
  await decideReorder(actor, reorderId, b.decision, b.note ?? null);
  return { ok: true };
});
