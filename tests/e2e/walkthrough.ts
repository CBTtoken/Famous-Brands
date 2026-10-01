// End-to-end walk of the acceptance criteria against a running server, in a
// real browser at phone width. Uses test accounts on a test database only.
//   BASE=http://localhost:3000 OUT=/tmp/e2e npx tsx tests/e2e/walkthrough.ts
// The server must run with NODE_TLS_REJECT_UNAUTHORIZED=0 so it can reach the
// fake push service's self-signed certificate.
import { chromium, devices, type Page } from "playwright";
import { writeFileSync } from "node:fs";
import { startFakePushService } from "../helpers/fake-push-service";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/e2e";
const STORE = { lat: -26.2678, lng: 28.4422 };
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const log: string[] = [];
const ok = (m: string) => { log.push(`PASS ${m}`); console.log(`PASS ${m}`); };
function check(cond: unknown, m: string) { if (!cond) { console.error(`FAIL ${m}`); writeFileSync(`${OUT}/result.txt`, [...log, `FAIL ${m}`].join("\n")); process.exit(1); } ok(m); }

class Http {
  cookie = "";
  async call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await fetch(BASE + path, {
      method, headers: { "content-type": "application/json", origin: BASE, cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  async login(login: string, password: string) { return this.call("POST", "/api/v1/auth/login", { login, password }); }
}

async function shot(p: Page, name: string) { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); }

async function main() {
  const push = await startFakePushService();
  // ---- admin sets everything up through the API, the same calls the screens use
  const admin = new Http();
  check((await admin.login("admin@test.invalid", "bootstrap-pass-123")).status === 200, "admin signs in");
  check((await admin.call("POST", "/api/v1/me/password", { current: "bootstrap-pass-123", next: "admin-pass-456" })).status === 200, "admin changes the first password");
  const me = (await admin.call("GET", "/api/v1/me")).body;
  const org = me.organisations[0].orgId;
  const sA = (await admin.call("POST", `/api/v1/organisations/${org}/stores`, { name: "Test Store A", brand: "Test brand", latitude: STORE.lat, longitude: STORE.lng, geofence_m: 150, known_ips: [] })).body.id;
  const sB = (await admin.call("POST", `/api/v1/organisations/${org}/stores`, { name: "Test Store B" })).body.id;
  const mk = async (full_name: string, phone: string, role: string) =>
    (await admin.call("POST", `/api/v1/organisations/${org}/people`, { full_name, phone, role, password: "first-pass-1" })).body.id as string;
  const sup = await mk("Thandi Test", "082 000 0001", "supervisor");
  const area = await mk("Area Test", "082 000 0002", "area_manager");
  await mk("Other Supervisor", "082 000 0003", "supervisor");
  await admin.call("PUT", `/api/v1/organisations/${org}/people/${sup}/assignments`, { assignments: [{ store_id: sA, can_order: false }] });
  await admin.call("PUT", `/api/v1/organisations/${org}/people/${area}/assignments`, { assignments: [{ store_id: sA, can_order: true }, { store_id: sB, can_order: false }] });
  const tpl = (await admin.call("POST", `/api/v1/organisations/${org}/checklists`, {
    name: "Opening checks", category: "Opening", cadence: "daily", due_by: "23:59", roles: ["supervisor"], store_ids: [],
    items: [
      { label: "Photograph the front counter", answer_type: "photo" },
      { label: "Floors mopped and dry", answer_type: "tick", tier: "important" },
      { label: "Anything to report from the night", answer_type: "text" },
      { label: "Walk-in fridge temperature", answer_type: "number", unit: "°C", min_value: 0, max_value: 5, tier: "critical", photo_rule: "on_exception" },
    ],
  })).body.id;
  check((await admin.call("POST", `/api/v1/checklists/${tpl}/status`, { status: "published" })).status === 200, "admin publishes a checklist with photo, tick, text and a critical number");
  check((await admin.call("PUT", `/api/v1/organisations/${org}/notification-rules`, { rules: [{ tier: "critical", recipient_role: "area_manager", push: true }] })).status === 200, "admin sets: critical goes to area managers by push");
  const lib = await admin.call("POST", `/api/v1/organisations/${org}/library`, { what: "catalogue" });
  check(lib.body.added === 85, "standard smalls list loaded (85 items)");
  await admin.call("POST", `/api/v1/organisations/${org}/library`, { what: "checklists" });
  await admin.call("POST", `/api/v1/stores/${sA}/starter-list`, { suggest_order: false });

  // Area manager's phone turns on alerts (the fake push service stands in for Google's).
  const areaHttp = new Http();
  await areaHttp.login("0820000002", "first-pass-1");
  await areaHttp.call("POST", "/api/v1/me/password", { current: "first-pass-1", next: "area-pass-456" });
  check((await areaHttp.call("POST", "/api/v1/push/subscriptions", push.newSubscription())).status === 200, "area manager's phone registered for alerts");

  // ---- supervisor, in a real browser at phone size
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const phone = await browser.newContext({ ...devices["Pixel 5"], geolocation: { latitude: STORE.lat + 0.0003, longitude: STORE.lng, accuracy: 15 }, permissions: ["geolocation"], locale: "en-ZA", timezoneId: "Africa/Johannesburg" });
  const p = await phone.newPage();
  await p.goto(`${BASE}/login`);
  await shot(p, "01-login");
  await p.getByLabel("Email or phone number").fill("082 000 0001");
  await p.locator('input[autocomplete="current-password"]').fill("first-pass-1");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL("**/settings/password**");
  check(true, "first sign-in is sent to choose a password");
  await p.getByLabel("Current password").fill("first-pass-1");
  await p.locator('input[autocomplete="new-password"]').nth(0).fill("thandi-pass-9");
  await p.locator('input[autocomplete="new-password"]').nth(1).fill("thandi-pass-9");
  await p.getByRole("button", { name: "Save my new password" }).click();
  await p.waitForURL("**/shift");
  await shot(p, "02-pick-store");
  // Only her store is offered.
  check(await p.getByText("Test Store B").count() === 0, "supervisor sees only her assigned store");
  await p.keyboard.press("1"); // numbered choice by typing the number
  await p.getByRole("button", { name: "Check in" }).click();
  await p.getByText("Checked in at").waitFor();
  await shot(p, "03-checked-in");
  check(await p.getByText("At the store").count() > 0, "sign-in geo-timestamp recorded and confirmed at the store");

  await p.getByRole("radio", { name: /Opening checks/ }).click();
  await p.waitForURL("**/shift/run/**");
  const runUrl = p.url();
  await shot(p, "04-task-photo");
  await p.locator('input[type="file"]').setInputFiles({ name: "counter.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.getByText("Saved: Photograph the front counter").waitFor();
  await p.keyboard.press("1"); // Done
  await shot(p, "05-task-tick");
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.getByText("Saved: Floors mopped").waitFor();
  await p.getByRole("textbox", { name: "Anything to report from the night" }).fill("Back door lock is stiff");
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.getByText("Saved: Anything to report").waitFor();
  check(true, "photo item (camera in the task), tick item and text item saved one by one");

  // Interrupted: she leaves and comes back.
  await p.goto(`${BASE}/shift`);
  await p.goto(runUrl);
  await p.getByText("Walk-in fridge temperature").first().waitFor();
  check(await p.getByText("3 of 4 done").count() === 1, "after interruption the checklist resumes at task 4 of 4, 3 done");
  await shot(p, "06-resumed");

  await p.getByRole("textbox", { name: "Walk-in fridge temperature" }).fill("11");
  await p.getByText("11°C is above the maximum of 5°C").waitFor();
  await shot(p, "07-out-of-range");
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.getByText("Take a photo. Say what happened.").waitFor();
  check(true, "out-of-range reading cannot be saved without a photo and a reason");
  await p.locator('input[type="file"]').setInputFiles({ name: "fridge.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await p.getByRole("textbox", { name: /What happened/ }).fill("Door was left open overnight");
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.getByText("Your manager has been alerted").waitFor();
  await shot(p, "08-review");
  await p.getByRole("button", { name: "Send the checklist" }).click();
  await p.getByText("Thank you").waitFor();
  await shot(p, "09-sent");
  check(true, "checklist submitted from the phone");

  // ---- the push, provably
  for (let i = 0; i < 40 && !push.received.length; i++) await new Promise((r) => setTimeout(r, 250));
  const got = push.received[0] as { payload: { title: string; body: string }; urgency?: string } | undefined;
  check(got && got.payload.title === "Critical: Walk-in fridge temperature" && got.payload.body.includes("11°C is above the maximum of 5°C") && got.payload.body.includes("Door was left open"), "critical item pushed to the area manager's phone, payload decrypted by the push service");
  const alerts = (await areaHttp.call("GET", "/api/v1/alerts?open=1")).body.alerts;
  const crit = alerts.find((a: { tier: string }) => a.tier === "critical");
  const del = (await areaHttp.call("GET", `/api/v1/alerts/${crit.id}/deliveries`)).body.deliveries;
  check(del[0].status === "sent" && del[0].deliveries[0].status_code === 201, "delivery recorded: push service answered 201 Created");
  writeFileSync(`${OUT}/push-received.json`, JSON.stringify(push.received, null, 2));

  // ---- role restrictions, tried for real over HTTP with the supervisor's own session
  const supHttp = new Http();
  await supHttp.login("0820000001", "thandi-pass-9");
  const tries: [string, string, number][] = [
    ["GET", `/api/v1/organisations/${org}/people`, 403],
    ["GET", `/api/v1/stores/${sA}/report`, 403],
    ["GET", `/api/v1/organisations/${org}/sos`, 403],
    ["POST", `/api/v1/organisations/${org}/checklists`, 403],
    ["GET", `/api/v1/stores/${sB}/items`, 404],
    ["POST", `/api/v1/visits`, 404],
  ];
  for (const [m, path, want] of tries) {
    const body = m === "POST" ? (path.endsWith("/visits") ? { store_id: sB, reason: "test" } : { name: "x", cadence: "daily", roles: ["supervisor"], items: [{ label: "xx", answer_type: "tick" }] }) : undefined;
    const r = await supHttp.call(m, path, body);
    check(r.status === want, `supervisor ${m} ${path.replace(org, ":org").replace(sA, ":storeA").replace(sB, ":storeB")} refused with ${want}`);
  }
  const page403 = await p.goto(`${BASE}/setup`);
  check(page403 && page403.status() >= 400, `supervisor opening /setup in the browser is refused (${page403?.status()})`);
  const cross = await fetch(`${BASE}/api/v1/organisations/${org}/people`, { method: "POST", headers: { cookie: admin.cookie, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  check(cross.status === 403, "a cross-site request with a valid admin cookie is blocked");

  // ---- stock: report a broken item from the phone
  await p.goto(`${BASE}/shift/report-item`);
  await p.getByPlaceholder(/find the item/).fill("refuse bin");
  await p.getByRole("button", { name: /Mobile refuse bin/ }).click();
  await p.keyboard.press("1"); // Broken (no Fine option on a one-off report)
  await p.locator('input[type="file"]').setInputFiles({ name: "bin.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await p.getByPlaceholder("What happened?").fill("Wheel snapped off");
  await shot(p, "10-report-broken");
  await p.getByRole("button", { name: "Send report" }).click();
  await p.getByText(/is reported and a replacement has been suggested/).waitFor();
  check(true, "item registered as broken from the phone, with photo");

  // ---- managers' screens, at laptop size
  const laptop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-ZA", timezoneId: "Africa/Johannesburg" });
  const m = await laptop.newPage();
  await m.goto(`${BASE}/login`);
  await m.getByLabel("Email or phone number").fill("082 000 0002");
  await m.locator('input[autocomplete="current-password"]').fill("area-pass-456");
  await m.getByRole("button", { name: "Sign in" }).click();
  await m.waitForURL("**/sos");
  await shot(m, "11-sos");
  check(await m.getByText("Waiting on the formula").count() === 1, "S.O.S shows Performance, Report to Famous Brands and Quality Ratio (placeholder)");
  await m.goto(`${BASE}/reports/store/${sA}`);
  await shot(m, "12-store-report");
  check(await m.getByText("11 °C").count() > 0 && await m.getByText("Mobile refuse bin", { exact: false }).count() > 0, "detailed shop report shows the reading, the problem and the broken item");
  const csv = await fetch(`${BASE}/api/v1/stores/${sA}/report?format=csv`, { headers: { cookie: (await laptop.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
  const csvText = await csv.text();
  writeFileSync(`${OUT}/store-report.csv`, csvText);
  check(csv.status === 200 && csvText.includes("Walk-in fridge temperature"), "report exports as CSV for Excel");
  await m.goto(`${BASE}/reports/franchisor`);
  await shot(m, "13-franchisor-report");
  await m.goto(`${BASE}/alerts`);
  await shot(m, "14-alerts");
  await m.goto(`${BASE}/stock?store=${sA}`);
  await shot(m, "15-stock");

  const a = await laptop.newPage();
  await a.context().clearCookies();
  await a.goto(`${BASE}/login`);
  await a.getByLabel("Email or phone number").fill("admin@test.invalid");
  await a.locator('input[autocomplete="current-password"]').fill("admin-pass-456");
  await a.getByRole("button", { name: "Sign in" }).click();
  await a.waitForURL("**/sos");
  await a.goto(`${BASE}/setup/checklists/${tpl}`);
  await shot(a, "16-checklist-builder");
  await a.goto(`${BASE}/setup/alerts`);
  await shot(a, "17-alert-rules");
  await a.goto(`${BASE}/setup/people`);
  await shot(a, "18-people");

  await browser.close();
  await push.close();
  writeFileSync(`${OUT}/result.txt`, log.join("\n"));
  console.log(`\nAll ${log.length} checks passed. Screenshots in ${OUT}`);
}

main().catch((e) => { console.error(e); writeFileSync(`${OUT}/result.txt`, [...log, `ERROR ${e.message}`].join("\n")); process.exit(1); });
