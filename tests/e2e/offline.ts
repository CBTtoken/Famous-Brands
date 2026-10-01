// Proves the offline outbox: an answer saved with no signal is kept on the
// phone and reaches the server when signal returns, with the phone's capture
// time preserved and the server's own time stamped on arrival.
// Run after walkthrough.ts, against the same server and data.
import { chromium, devices } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/e2e";
const STORE = { lat: -26.2678, lng: 28.4422 };

async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", origin: BASE, cookie }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0], body: await r.json().catch(() => null) };
}
function check(c: unknown, m: string) { if (!c) { console.error(`FAIL ${m}`); process.exit(1); } console.log(`PASS ${m}`); }

(async () => {
  const login = await api("", "POST", "/api/v1/auth/login", { login: "admin@test.invalid", password: "admin-pass-456" });
  const admin = login.cookie!;
  const org = (await api(admin, "GET", "/api/v1/me")).body.organisations[0].orgId;
  const tpl = (await api(admin, "POST", `/api/v1/organisations/${org}/checklists`, {
    name: "Cold room check", category: "Cold room", cadence: "as_needed", roles: ["supervisor"], store_ids: [],
    items: [{ label: "Cold room door seal intact", answer_type: "tick" }, { label: "Cold room note", answer_type: "text" }],
  })).body.id;
  await api(admin, "POST", `/api/v1/checklists/${tpl}/status`, { status: "published" });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ ...devices["Pixel 5"], geolocation: { latitude: STORE.lat, longitude: STORE.lng, accuracy: 10 }, permissions: ["geolocation"] });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email or phone number").fill("0820000001");
  await p.locator('input[autocomplete="current-password"]').fill("thandi-pass-9");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL("**/shift");
  if (await p.getByRole("button", { name: "Check in" }).count()) {
    await p.keyboard.press("1");
    await p.getByRole("button", { name: "Check in" }).click();
    await p.getByText("Checked in at").waitFor();
  }
  await p.getByRole("radio", { name: /Cold room check/ }).click();
  await p.waitForURL("**/shift/run/**");
  const runId = p.url().split("/").pop()!;

  await ctx.setOffline(true);
  await p.keyboard.press("1");
  await p.getByRole("button", { name: "Save and next" }).click();
  await p.getByText("No signal. Saved on this phone").waitFor();
  await p.screenshot({ path: `${OUT}/19-offline-saved.png`, fullPage: true });
  check(true, "with no signal, the answer is kept on the phone and she moves on");
  const before = (await api(admin, "GET", `/api/v1/runs/${runId}`)).body;
  check(before.done === 0, "the server has not received it yet");

  await new Promise((r) => setTimeout(r, 2500));
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  for (let i = 0; i < 40; i++) {
    const r = (await api(admin, "GET", `/api/v1/runs/${runId}`)).body;
    if (r.done === 1) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  const after = (await api(admin, "GET", `/api/v1/runs/${runId}`)).body;
  const a = after.items[0].answer;
  check(after.done === 1 && a.value_bool === true, "when signal returns the answer reaches the server");
  check(Date.parse(a.received_at) - Date.parse(a.client_captured_at) >= 2000, "the phone's capture time is kept, and the server stamps its own later time on arrival");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
