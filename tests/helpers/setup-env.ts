// Runs before any test module is imported, so the app's config sees these.
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import webpush from "web-push";

process.env.DATABASE_URL ??= "postgres://postgres@localhost/sos_test";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), "sos-photos-"));
process.env.APP_TIME_ZONE = "Africa/Johannesburg";
// The fake push service uses a self-signed certificate. Tests only.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const keys = webpush.generateVAPIDKeys();
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

const g = globalThis as unknown as { __dbReset?: boolean };
if (!g.__dbReset) {
  execSync(`psql "${process.env.DATABASE_URL}" -q -c "drop schema public cascade; create schema public;"`, { stdio: "ignore" });
  execSync("node scripts/migrate.mjs", { env: process.env, stdio: "ignore" });
  g.__dbReset = true;
}
