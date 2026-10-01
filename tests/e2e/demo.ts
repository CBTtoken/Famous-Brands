// Walks the demo accounts in a real browser at phone width: the platform
// admin makes the demo group, the demo supervisor does the demo checklist,
// and the critical item reaches the demo shop manager's phone.
//   BASE=http://localhost:3000 OUT=/tmp/e2e ADMIN_LOGIN=... ADMIN_PASSWORD=... npx tsx tests/e2e/demo.ts
// Run against a test database only, with NODE_TLS_REJECT_UNAUTHORIZED=0 on
// the server (the fake push service has a self-signed certificate).
import { chromium, devices, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { startFakePushService } from "../helpers/fake-push-service";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/e2e";
const ADMIN_LOGIN = process.env.ADMIN_LOGIN ?? "admin@test.invalid";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-pass-456";
const DEMO_PASSWORD = "demo-walk-password-1";
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const log: string[] = [];
function check(cond: unknown, m: string) {
  const line = `${cond ? "PASS" : "FAIL"} ${m}`;
  log.push(line);
  console.log(line);
  writeFileSync(`${OUT}/demo-result.txt`, log.join("\n"));
  if (!cond) process.exit(1);
}
const shot = (p: Page, name: string) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

async function signIn(p: Page, login: string, password: string) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email or phone number").fill(login);
  await p.locator('input[autocomplete="current-password"]').fill(password);
  await p.getByRole("button", { name: "Sign in" }).click();
}

async function main() {
  const push = await startFakePushService();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const phoneOpts = { ...devices["Pixel 5"], geolocation: { latitude: -26.2, longitude: 28.0, accuracy: 20 }, permissions: ["geolocation"], locale: "en-ZA", timezoneId: "Africa/Johannesburg" };

  // ---- the platform admin makes the demo group
  const a = await (await browser.newContext(phoneOpts)).newPage();
  await signIn(a, ADMIN_LOGIN, ADMIN_PASSWORD);
  await a.waitForLoadState("networkidle");
  await a.goto(`${BASE}/platform`);
  await a.getByLabel("Demo password").fill(DEMO_PASSWORD);
  check(await a.getByText(`You typed: ${DEMO_PASSWORD}`).count() === 1, "the demo password is read back before it is used");
  await a.getByRole("button", { name: "Make the demo group" }).click();
  await a.getByText("Demo group made").waitFor();
  await shot(a, "d1-demo-made");
  check(await a.getByText(/and \d+ draft checklists/).count() === 1, "the confirmation says what was made");
  check(await a.getByText("supervisor@demo.sos.invalid").count() === 1, "the four demo sign-ins are listed");

  // ---- the demo shop manager's phone takes alerts (the fake push service stands in for the phone)
  const mgr = await (await browser.newContext(phoneOpts)).newPage();
  await signIn(mgr, "shop.manager@demo.sos.invalid", DEMO_PASSWORD);
  await mgr.waitForLoadState("networkidle");
  const sub = await mgr.evaluate(async ([url, body]) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
    return r.status;
  }, [`${BASE}/api/v1/push/subscriptions`, JSON.stringify(push.newSubscription())] as const);
  check(sub === 200, "demo shop manager's phone registered for alerts");

  // ---- the demo supervisor, on a phone
  const p = await (await browser.newContext(phoneOpts)).newPage();
  await signIn(p, "supervisor@demo.sos.invalid", DEMO_PASSWORD);
  await p.waitForURL("**/shift");
  check(await p.getByText("Demo shop group. Not a real franchisee or store").count() === 1, "the demo banner shows on the supervisor's screen");
  await shot(p, "d2-demo-shift");
  await p.keyboard.press("1");
  await p.getByRole("button", { name: "Check in" }).click();
  await p.getByText("Checked in at").waitFor();
  await shot(p, "d3-demo-checked-in");
  await p.getByRole("radio", { name: /DEMO: proof of concept/ }).click();
  await p.waitForURL("**/shift/run/**");
  await p.waitForLoadState("networkidle");
  await p.keyboard.press("2"); // not done, by typing the number
  await p.getByRole("button", { name: "Save and next" }).and(p.locator(":enabled")).waitFor();
  await shot(p, "d4-demo-not-done");
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.locator('input[type="file"]').waitFor({ state: "attached" });
  await shot(p, "d4b-demo-needs-proof");
  await p.locator('input[type="file"]').setInputFiles({ name: "extinguisher.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await p.getByRole("textbox", { name: /What happened|reason|why/i }).fill("Extinguisher missing from its bracket");
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.getByText("Task 2 of 4").waitFor();
  await shot(p, "d5-demo-saved");
  check(true, "the demo supervisor records the critical item as not done, with a photo and a reason");

  for (let i = 0; i < 40 && !push.received.length; i++) await new Promise((r) => setTimeout(r, 250));
  const got = push.received[0] as { payload: { title: string; body: string } } | undefined;
  check(got?.payload.title.startsWith("Critical: Fire extinguisher"), "the critical item reached the demo shop manager's phone");
  writeFileSync(`${OUT}/demo-push-received.json`, JSON.stringify(push.received, null, 2));

  await browser.close();
  await push.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
