import { NextResponse } from "next/server";
import { z } from "zod";
import { api, json } from "@/lib/http";
import { roleIn } from "@/lib/core/authz";
import { notFound } from "@/lib/core/errors";
import { ORG_COOKIE } from "@/lib/org-context";
import { config } from "@/lib/config";

// Which shop group the screens work in, for people who belong to more than one.
export const POST = api(async (req, actor) => {
  const { org_id } = z.object({ org_id: z.string().uuid() }).parse(await json(req));
  if (!roleIn(actor, org_id)) throw notFound("That group");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ORG_COOKIE, org_id, { httpOnly: true, sameSite: "lax", secure: config.secureCookies, path: "/", maxAge: 31536000 });
  return res;
});
