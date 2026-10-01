import { NextResponse } from "next/server";
import { api } from "@/lib/http";
import { destroySession, SESSION_COOKIE } from "@/lib/core/auth";

export const POST = api(async (req) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}, { public: true });
