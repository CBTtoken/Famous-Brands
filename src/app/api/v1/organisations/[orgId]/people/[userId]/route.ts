import { z } from "zod";
import { api, json } from "@/lib/http";
import { updatePerson } from "@/lib/services/org";

const input = z.object({
  full_name: z.string().optional(), email: z.string().nullish(), phone: z.string().nullish(),
  role: z.enum(["admin", "area_manager", "shop_manager", "supervisor"]).optional(), active: z.boolean().optional(),
});
export const PATCH = api<{ orgId: string; userId: string }>(async (req, actor, { orgId, userId }) => {
  await updatePerson(actor, orgId, userId, input.parse(await json(req)));
  return { ok: true };
});
