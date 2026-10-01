import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { photoStore } from "@/lib/storage";
import { pushConfigured } from "@/lib/services/push";

// Tests the real capability, not the presence of a setting: a database round
// trip, and a photo-store write and read back.
export async function GET() {
  const out: Record<string, { ok: boolean; detail?: string }> = {};
  try {
    const r = await one<{ n: number }>(`select count(*)::int as n from schema_migrations`);
    out.database = { ok: true, detail: `${r?.n ?? 0} migrations applied` };
  } catch (e) {
    out.database = { ok: false, detail: (e as Error).message };
  }
  try {
    const key = "_health/probe.txt";
    const body = Buffer.from(`health ${new Date().toISOString()}`);
    await photoStore().put(key, body, "text/plain");
    const back = await photoStore().get(key);
    out.photo_storage = { ok: back.equals(body), detail: back.equals(body) ? "write and read back matched" : "read back did not match" };
  } catch (e) {
    out.photo_storage = { ok: false, detail: (e as Error).message };
  }
  out.push_keys = { ok: pushConfigured(), detail: pushConfigured() ? "VAPID keys set" : "VAPID keys missing, alerts cannot be pushed" };
  const ok = Object.values(out).every((c) => c.ok);
  return NextResponse.json({ ok, checks: out }, { status: ok ? 200 : 503 });
}
