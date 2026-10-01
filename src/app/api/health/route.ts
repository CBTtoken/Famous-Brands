import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { photoStore } from "@/lib/storage";
import { pushConfigured } from "@/lib/services/push";

// Tests the real capability, not the presence of a setting: a database round
// trip, and a photo-store write and read back. Only the database decides the
// status code, because the container is restarted on failure and a missing
// push key should not take the whole app down. The other checks are reported
// so a person looking at this page sees exactly what is not working.
// Error details are logged on the server, never shown here.
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  try {
    const r = await one<{ n: number }>(`select count(*)::int as n from schema_migrations`);
    checks.database = { ok: true, detail: `${r?.n ?? 0} migrations applied` };
  } catch (e) {
    console.error("health: database", e);
    checks.database = { ok: false, detail: "cannot reach the database" };
  }
  try {
    const key = "_health/probe.txt";
    const body = Buffer.from(`health ${new Date().toISOString()}`);
    await photoStore().put(key, body, "text/plain");
    const back = await photoStore().get(key);
    checks.photo_storage = back.equals(body) ? { ok: true, detail: "write and read back matched" } : { ok: false, detail: "read back did not match" };
  } catch (e) {
    console.error("health: storage", e);
    checks.photo_storage = { ok: false, detail: "cannot write photos" };
  }
  checks.push_keys = pushConfigured() ? { ok: true, detail: "push keys set" } : { ok: false, detail: "push keys missing, alerts cannot be pushed" };
  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, live: checks.database.ok, checks }, { status: checks.database.ok ? 200 : 503 });
}
