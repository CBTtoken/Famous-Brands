import { z } from "zod";
import { api, json } from "@/lib/http";
import { setAssignments } from "@/lib/services/org";

const input = z.object({ assignments: z.array(z.object({ store_id: z.string().uuid(), can_order: z.boolean().default(false) })) });
export const PUT = api<{ orgId: string; userId: string }>(async (req, actor, { orgId, userId }) => {
  await setAssignments(actor, orgId, userId, input.parse(await json(req)).assignments);
  return { ok: true };
});
