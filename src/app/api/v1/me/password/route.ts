import { z } from "zod";
import { api, json } from "@/lib/http";
import { changeOwnPassword } from "@/lib/services/org";

const input = z.object({ current: z.string(), next: z.string() });
export const POST = api(async (req, actor) => {
  const b = input.parse(await json(req));
  await changeOwnPassword(actor, b.current, b.next);
  return { ok: true };
});
