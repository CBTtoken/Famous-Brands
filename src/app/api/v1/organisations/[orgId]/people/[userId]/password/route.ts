import { z } from "zod";
import { api, json } from "@/lib/http";
import { adminResetPassword } from "@/lib/services/org";

export const POST = api<{ orgId: string; userId: string }>(async (req, actor, { orgId, userId }) => {
  const { password } = z.object({ password: z.string() }).parse(await json(req));
  await adminResetPassword(actor, orgId, userId, password);
  return { ok: true };
});
