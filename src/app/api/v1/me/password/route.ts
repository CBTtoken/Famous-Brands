import { z } from "zod";
import { api, json } from "@/lib/http";
import { changeOwnPassword } from "@/lib/services/org";
import { SESSION_COOKIE } from "@/lib/core/auth";

const input = z.object({ current: z.string(), next: z.string() });
export const POST = api(async (req, actor) => {
  const b = input.parse(await json(req));
  // Every other signed-in phone is signed out; this one stays signed in.
  await changeOwnPassword(actor, b.current, b.next, req.cookies.get(SESSION_COOKIE)?.value ?? null);
  return { ok: true };
}, { allowBeforePasswordChange: true });
