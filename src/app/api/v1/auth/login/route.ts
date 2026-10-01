import { NextResponse } from "next/server";
import { z } from "zod";
import { api, clientIp, json } from "@/lib/http";
import { authenticate, createSession, loginKey, SESSION_COOKIE } from "@/lib/core/auth";
import { AppError } from "@/lib/core/errors";
import { recordEvent } from "@/lib/core/events";
import { one } from "@/lib/db";
import { config } from "@/lib/config";

const input = z.object({ login: z.string().min(1, "Enter your email or phone number"), password: z.string().min(1, "Enter your password") });

// Ten wrong passwords for one account, or thirty from one address, in fifteen
// minutes, and sign-in pauses for that account or address.
const PER_LOGIN = 10;
const PER_IP = 30;

export const POST = api(async (req) => {
  const { login, password } = input.parse(await json(req));
  const key = loginKey(login);
  const ip = clientIp(req.headers);
  const recent = await one<{ by_login: number; by_ip: number }>(
    `select count(*) filter (where payload->>'login' = $1)::int as by_login,
            count(*) filter (where $2::text is not null and payload->>'ip' = $2)::int as by_ip
     from events where type = 'session.sign_in_failed' and created_at > now() - interval '15 minutes'`,
    [key, ip],
  );
  if ((recent?.by_login ?? 0) >= PER_LOGIN || (recent?.by_ip ?? 0) >= PER_IP) {
    throw new AppError(429, "too_many_attempts", "Too many wrong passwords. Wait 15 minutes, or ask your manager to set a new password.");
  }
  const userId = await authenticate(login, password);
  if (!userId) {
    await recordEvent(null, null, "session.sign_in_failed", "user", null, { login: key, ip });
    throw new AppError(401, "bad_login", "That email or phone number and password do not match. Check both and try again.");
  }
  const { token, expires } = await createSession(userId, { ip, userAgent: req.headers.get("user-agent") });
  await recordEvent(null, null, "session.signed_in", "user", userId, { ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.secureCookies, path: "/", expires });
  return res;
}, { public: true });
