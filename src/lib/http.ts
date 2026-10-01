import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { config } from "./config";
import { actorFromApiKey, actorFromSessionToken, SESSION_COOKIE, type Actor, type UserActor } from "./core/auth";
import { AppError, unauthenticated } from "./core/errors";

/** The person (or system) calling the API: a session cookie or an API key. */
export async function actorFromRequest(req: NextRequest): Promise<Actor | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return actorFromApiKey(auth.slice(7).trim());
  return actorFromSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export function clientIp(h: Headers): string | null {
  if (config.trustProxy) {
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = h.get("x-real-ip");
    if (real) return real.trim();
  }
  return null;
}

/**
 * Browser calls that change something must come from this site. API keys
 * are not sent by browsers on their own, so they are exempt.
 */
function sameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return true;
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Ctx<P> = { params: Promise<P> };

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const field = first?.path.join(".");
    return NextResponse.json(
      { error: { code: "invalid", message: first?.message && !first.message.startsWith("Invalid") ? first.message : `Please check ${field || "what you entered"}.`, details: e.issues } },
      { status: 400 },
    );
  }
  const pg = e as { code?: string; message?: string };
  if (pg?.message?.includes("cannot be changed") || pg?.message?.includes("cannot be deleted")) {
    return NextResponse.json({ error: { code: "locked", message: pg.message.replace(/^.*?: /, "") } }, { status: 409 });
  }
  console.error(e);
  return NextResponse.json(
    { error: { code: "server_error", message: "Something went wrong on our side. It may not have saved, please try again." } },
    { status: 500 },
  );
}

/**
 * Every API route goes through here: who is calling, is the call from our own
 * site, and every error turned into one plain-language JSON shape.
 */
export function api<P = Record<string, never>>(
  fn: (req: NextRequest, actor: Actor, params: P) => Promise<unknown>,
  opts: { public?: boolean } = {},
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      if (!sameOrigin(req)) return NextResponse.json({ error: { code: "bad_origin", message: "Request blocked." } }, { status: 403 });
      const actor = await actorFromRequest(req);
      if (!actor && !opts.public) throw unauthenticated();
      const params = (await ctx.params) ?? ({} as P);
      const out = await fn(req, actor as Actor, params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function json<T = unknown>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError(400, "bad_json", "The request could not be read.");
  }
}

// ---- pages -------------------------------------------------------------------------

/** For server-rendered pages: the signed-in person, or off to the sign-in screen. */
export async function pageActor(): Promise<UserActor> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const actor = await actorFromSessionToken(token);
  if (!actor) redirect("/login");
  return actor;
}

export async function requestIp() {
  return clientIp(await headers());
}
