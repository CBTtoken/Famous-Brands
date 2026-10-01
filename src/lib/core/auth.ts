import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { config } from "../config";
import { one, q } from "../db";
import type { Role } from "./authz";

export const SESSION_COOKIE = "sos_session";

export const hashPassword = (pw: string) => hash(pw);
export const verifyPassword = (stored: string, pw: string) => verify(stored, pw).catch(() => false);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type UserActor = {
  kind: "user";
  userId: string;
  name: string;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  orgs: { orgId: string; orgName: string; role: Role }[];
};
export type KeyActor = { kind: "api_key"; keyId: string; orgId: string; role: Role; name: string };
export type Actor = UserActor | KeyActor;

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionDays * 86400000);
  await q(
    `insert into sessions (token_hash, user_id, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5)`,
    [sha256(token), userId, expires, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null],
  );
  return { token, expires };
}

export async function destroySession(token: string) {
  await q(`delete from sessions where token_hash = $1`, [sha256(token)]);
}

export async function destroyUserSessions(userId: string) {
  await q(`delete from sessions where user_id = $1`, [userId]);
}

async function loadUserActor(userId: string): Promise<UserActor | null> {
  const u = await one<{ id: string; full_name: string; is_platform_admin: boolean; must_change_password: boolean; active: boolean }>(
    `select id, full_name, is_platform_admin, must_change_password, active from users where id = $1`,
    [userId],
  );
  if (!u || !u.active) return null;
  const orgs = await q<{ org_id: string; name: string; role: Role }>(
    `select m.org_id, o.name, m.role from memberships m join organisations o on o.id = m.org_id
     where m.user_id = $1 order by o.name`,
    [userId],
  );
  return {
    kind: "user",
    userId: u.id,
    name: u.full_name,
    isPlatformAdmin: u.is_platform_admin,
    mustChangePassword: u.must_change_password,
    orgs: orgs.map((o) => ({ orgId: o.org_id, orgName: o.name, role: o.role })),
  };
}

export async function actorFromSessionToken(token: string | undefined | null): Promise<UserActor | null> {
  if (!token) return null;
  const s = await one<{ user_id: string; last_seen_at: Date }>(
    `select user_id, last_seen_at from sessions where token_hash = $1 and expires_at > now()`,
    [sha256(token)],
  );
  if (!s) return null;
  // Touch at most once a minute; it is a "last seen", not a write per request.
  if (Date.now() - new Date(s.last_seen_at).getTime() > 60000) {
    await q(`update sessions set last_seen_at = now() where token_hash = $1`, [sha256(token)]);
  }
  return loadUserActor(s.user_id);
}

export async function actorFromApiKey(raw: string): Promise<KeyActor | null> {
  const k = await one<{ id: string; org_id: string; role: Role; name: string }>(
    `update api_keys set last_used_at = now() where key_hash = $1 and revoked_at is null
     returning id, org_id, role, name`,
    [sha256(raw)],
  );
  return k ? { kind: "api_key", keyId: k.id, orgId: k.org_id, role: k.role, name: k.name } : null;
}

export function newApiKey() {
  const raw = `sos_${randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 10), hash: sha256(raw) };
}

/** Email or phone, as typed. Phone numbers are normalised to +27 form. */
export function normaliseLogin(input: string): { email?: string; phone?: string } {
  const t = input.trim();
  if (t.includes("@")) return { email: t.toLowerCase() };
  const phone = normalisePhone(t);
  return phone ? { phone } : {};
}

export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(digits)) return `+27${digits.slice(1)}`;
  if (/^27\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  return null;
}

let dummyHash: Promise<string> | undefined;

export async function authenticate(login: string, password: string) {
  const { email, phone } = normaliseLogin(login);
  if (!email && !phone) return null;
  const u = await one<{ id: string; password_hash: string; active: boolean }>(
    email ? `select id, password_hash, active from users where email = $1` : `select id, password_hash, active from users where phone = $1`,
    [email ?? phone],
  );
  if (!u || !u.active) {
    // Same work either way, so a missing account is not faster to detect.
    dummyHash ??= hashPassword("not-a-real-password");
    await verifyPassword(await dummyHash, password);
    return null;
  }
  return (await verifyPassword(u.password_hash, password)) ? u.id : null;
}
