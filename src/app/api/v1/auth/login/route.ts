import { NextResponse } from "next/server";
import { z } from "zod";
import { api, clientIp, json } from "@/lib/http";
import { authenticate, createSession, SESSION_COOKIE } from "@/lib/core/auth";
import { AppError } from "@/lib/core/errors";
import { recordEvent } from "@/lib/core/events";
import { config } from "@/lib/config";

const input = z.object({ login: z.string().min(1, "Enter your email or phone number"), password: z.string().min(1, "Enter your password") });

export const POST = api(async (req) => {
  const { login, password } = input.parse(await json(req));
  const userId = await authenticate(login, password);
  if (!userId) throw new AppError(401, "bad_login", "That email or phone number and password do not match. Check both and try again.");
  const ip = clientIp(req.headers);
  const { token, expires } = await createSession(userId, { ip, userAgent: req.headers.get("user-agent") });
  await recordEvent(null, null, "session.signed_in", "user", userId, { ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.secureCookies, path: "/", expires });
  return res;
}, { public: true });
