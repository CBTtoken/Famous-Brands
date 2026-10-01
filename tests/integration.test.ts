import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { one, pool, q } from "@/lib/db";
import { actorFromApiKey, actorFromSessionToken, createSession, hashPassword, type Actor } from "@/lib/core/auth";
import { requireStore } from "@/lib/core/authz";
import { createPerson, listPeople, saveStore, setAssignments } from "@/lib/services/org";
import { getTemplate, saveTemplate, setTemplateStatus } from "@/lib/services/templates";
import { checkIn, checkOut } from "@/lib/services/visits";
import { dueChecklists, getRun, saveAnswer, startRun, submitRun } from "@/lib/services/runs";
import { uploadPhoto } from "@/lib/services/photos";
import { listAlerts, setNotificationRules } from "@/lib/services/alerts";
import { processNotificationQueue, saveSubscription } from "@/lib/services/push";
import { applyStarterList, decideReorder, listReorders, listStoreItems, reportCondition, startWalk, getWalk, submitWalk } from "@/lib/services/stock";
import { checklistReport, parseRange, sos } from "@/lib/services/reports";
import { importSmallsCatalogue, importStarterChecklists } from "@/lib/services/library";
import { createApiKey, eventFeed } from "@/lib/services/integration";
import { startFakePushService } from "./helpers/fake-push-service";

// A real 1x1 JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

const LAT = -26.2678, LNG = 28.4422; // a point to pin the test store on
const atStore = { lat: LAT + 0.0002, lng: LNG, accuracy_m: 12 };

let push: Awaited<ReturnType<typeof startFakePushService>>;
let platform: Actor, admin: Actor, areaMgr: Actor, shopMgrA: Actor, supA: Actor, supB: Actor, otherAdmin: Actor;
let orgId: string, otherOrgId: string, storeA: string, storeB: string, otherStore: string;

async function makeUser(name: string, email: string, platformAdmin = false) {
  const u = await one<{ id: string }>(
    `insert into users (full_name, email, password_hash, is_platform_admin, must_change_password) values ($1,$2,$3,$4,false) returning id`,
    [name, email, await hashPassword("correct horse battery"), platformAdmin],
  );
  return u!.id;
}
async function actorFor(userId: string) {
  const { token } = await createSession(userId, {});
  return (await actorFromSessionToken(token))!;
}
async function waitForQueue() {
  for (let i = 0; i < 50; i++) {
    await processNotificationQueue();
    const left = await one<{ n: number }>(`select count(*)::int as n from notifications where status = 'queued'`);
    if (!left?.n) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  push = await startFakePushService();
  platform = await actorFor(await makeUser("Platform Admin", "platform@test.invalid", true));
  const o = await one<{ id: string }>(`insert into organisations (name) values ('Test Franchise Group') returning id`);
  orgId = o!.id;
  const o2 = await one<{ id: string }>(`insert into organisations (name) values ('Another Group') returning id`);
  otherOrgId = o2!.id;
  storeA = await saveStore(platform, orgId, null, { name: "Store A", latitude: LAT, longitude: LNG, geofence_m: 150, known_ips: ["196.0.0.10"] });
  storeB = await saveStore(platform, orgId, null, { name: "Store B" });
  otherStore = await saveStore(platform, otherOrgId, null, { name: "Other Store" });

  const mk = async (name: string, email: string, role: "admin" | "area_manager" | "shop_manager" | "supervisor", org = orgId) => {
    const id = await createPerson(platform, org, { full_name: name, email, role, password: "first-password-1" });
    await q(`update users set must_change_password = false where id = $1`, [id]);
    return id;
  };
  const adminId = await mk("Org Admin", "admin@test.invalid", "admin");
  const areaId = await mk("Area Manager", "area@test.invalid", "area_manager");
  const shopAId = await mk("Shop Manager A", "shopa@test.invalid", "shop_manager");
  const supAId = await mk("Supervisor A", "supa@test.invalid", "supervisor");
  const supBId = await mk("Supervisor B", "supb@test.invalid", "supervisor");
  const otherAdminId = await mk("Other Admin", "other@test.invalid", "admin", otherOrgId);
  admin = await actorFor(adminId);
  await setAssignments(admin, orgId, areaId, [{ store_id: storeA, can_order: false }, { store_id: storeB, can_order: false }]);
  await setAssignments(admin, orgId, shopAId, [{ store_id: storeA, can_order: true }]);
  await setAssignments(admin, orgId, supAId, [{ store_id: storeA, can_order: false }]);
  await setAssignments(admin, orgId, supBId, [{ store_id: storeB, can_order: false }]);
  areaMgr = await actorFor(areaId);
  shopMgrA = await actorFor(shopAId);
  supA = await actorFor(supAId);
  supB = await actorFor(supBId);
  otherAdmin = await actorFor(otherAdminId);
});

afterAll(async () => {
  await push.close();
  await pool.end();
});

describe("Module 1: a supervisor completes a checklist on a phone", () => {
  let templateId: string;
  let runId: string;

  it("admin builds a checklist with photo, tick, text, number and a critical tier, without a developer", async () => {
    templateId = await saveTemplate(admin, orgId, null, {
      name: "Opening checks", category: "Opening", cadence: "daily", due_by: "09:00", roles: ["supervisor"], store_ids: [],
      items: [
        { label: "Photograph the front counter", answer_type: "photo" },
        { label: "Floors mopped", answer_type: "tick", tier: "important" },
        { label: "Anything to report", answer_type: "text" },
        { label: "Fridge temperature", answer_type: "number", unit: "°C", min_value: 0, max_value: 5, tier: "critical", photo_rule: "on_exception" },
      ],
    });
    await setTemplateStatus(admin, templateId, "published");
    const t = await getTemplate(admin, templateId);
    expect(t.items.map((i) => [i.answer_type, i.tier])).toEqual([["photo", null], ["tick", "important"], ["text", null], ["number", "critical"]]);
  });

  it("admin chooses who hears about critical items, and that person's phone has alerts on", async () => {
    await setNotificationRules(admin, orgId, [
      { tier: "critical", recipient_role: "area_manager", push: true },
      { tier: "critical", recipient_role: "shop_manager", push: true },
    ]);
    if (areaMgr.kind !== "user") throw new Error();
    await saveSubscription(areaMgr, push.newSubscription(), "Area manager's Android");
  });

  it("sign-in captures a geo-timestamp, checked against the store", async () => {
    const r = await checkIn(supA, { store_id: storeA, geo: atStore, client_time: new Date().toISOString() }, "196.0.0.10");
    expect(r).toMatchObject({ status: "checked_in", checks: { location: "ok", ip: "match", mismatch: false } });
    const v = await one<{ started_at: Date; start_lat: number; start_location_check: string }>(`select * from visits where id = $1`, [(r as { visit_id: string }).visit_id]);
    expect(v!.start_lat).toBeCloseTo(atStore.lat, 5);
    expect(v!.start_location_check).toBe("ok");
  });

  it("starting, answering three items, being interrupted, and resuming exactly where she left off", async () => {
    const visit = await one<{ id: string }>(`select id from visits where store_id = $1 and ended_at is null`, [storeA]);
    const due = await dueChecklists(supA, visit!.id);
    expect(due.map((d) => d.name)).toContain("Opening checks");
    runId = (await startRun(supA, templateId)).run_id;
    const run = await getRun(supA, runId);
    const [photoItem, tickItem, textItem] = run.items;

    const photo = await uploadPhoto(supA, { storeId: storeA, clientId: randomUUID(), bytes: JPEG, ...{ lat: atStore.lat, lng: atStore.lng } });
    await saveAnswer(supA, runId, photoItem.id, { photo_id: photo.id, geo: atStore, client_time: new Date().toISOString() });
    await saveAnswer(supA, runId, tickItem.id, { value_bool: true, geo: atStore });
    await saveAnswer(supA, runId, textItem.id, { value_text: "All good at opening", geo: atStore });

    // Phone dies. She comes back: the run resumes at item 4.
    const again = await startRun(supA, templateId);
    expect(again).toEqual({ run_id: runId, resumed: true });
    const resumed = await getRun(supA, runId);
    expect(resumed.done).toBe(3);
    expect(resumed.nextIndex).toBe(3);
    // Each answer carries its own geo-timestamp, separate from sign-in.
    expect(resumed.items[1].answer!.lat).toBeCloseTo(atStore.lat, 5);
    expect(resumed.items[1].answer!.received_at).toBeTruthy();
  });

  it("a critical reading out of range demands a photo and a reason, and pushes to the configured people", async () => {
    const run = await getRun(supA, runId);
    const fridge = run.items[3];
    const r = await saveAnswer(supA, runId, fridge.id, { value_number: 11, geo: atStore });
    expect(r).toMatchObject({ is_exception: true, complete: false, missing: ["Take a photo", "Say what happened"], alerted: true });
    await expect(submitRun(supA, runId)).rejects.toThrow(/not finished/);
    const photo = await uploadPhoto(supA, { storeId: storeA, clientId: randomUUID(), bytes: JPEG });
    const r2 = await saveAnswer(supA, runId, fridge.id, { value_number: 11, photo_id: photo.id, note: "Door left open", geo: atStore });
    expect(r2).toMatchObject({ complete: true, alerted: false });

    await waitForQueue();
    const alert = await one<{ id: string; tier: string }>(`select id, tier from alerts where source_id = $1`, [fridge.id]);
    expect(alert!.tier).toBe("critical");
    const notes = await q<{ full_name: string; status: string }>(
      `select u.full_name, n.status from notifications n join users u on u.id = n.user_id where n.alert_id = $1 order by u.full_name`, [alert!.id]);
    // The area manager has a phone registered: sent. The shop manager has none: recorded honestly as no_device.
    expect(notes).toEqual([{ full_name: "Area Manager", status: "sent" }, { full_name: "Shop Manager A", status: "no_device" }]);
    const d = await one<{ ok: boolean; status_code: number }>(`select d.ok, d.status_code from push_deliveries d join notifications n on n.id = d.notification_id where n.alert_id = $1`, [alert!.id]);
    expect(d).toEqual({ ok: true, status_code: 201 });
    // What the phone actually received, decrypted.
    const got = push.received.at(-1)!;
    expect(got.payload).toMatchObject({ title: "Critical: Fridge temperature", body: expect.stringContaining("11°C is above the maximum of 5°C") });
    expect(got.urgency).toBe("high");
    // Supervisor B covers a different store and is not told.
    expect(notes.find((n) => n.full_name === "Supervisor B")).toBeUndefined();
  });

  it("submits, and after that nothing can be changed, not even directly in the database", async () => {
    const s = await submitRun(supA, runId);
    expect(s).toMatchObject({ items: 4, exceptions: 1 });
    const item = (await getRun(supA, runId)).items[1];
    await expect(saveAnswer(supA, runId, item.id, { value_bool: false, note: "x", geo: atStore })).rejects.toThrow(/submitted/);
    await expect(q(`update answers set value_bool = false where run_item_id = $1`, [item.id])).rejects.toThrow(/submitted/);
    await expect(q(`delete from checklist_runs where id = $1`, [runId])).rejects.toThrow(/cannot be deleted/);
    await expect(q(`update visits set start_lat = 0 where store_id = $1`, [storeA])).rejects.toThrow();
    await expect(q(`delete from events`)).rejects.toThrow(/cannot be changed/);
  });

  it("a check-in that does not match is never blocked by default, needs a reason, and is alerted", async () => {
    await setNotificationRules(admin, orgId, [{ tier: "important", recipient_role: "admin", push: false }, { tier: "critical", recipient_role: "area_manager", push: true }]);
    const first = await checkIn(supA, { store_id: storeA, geo: { lat: LAT + 0.05, lng: LNG, accuracy_m: 10 } }, "41.1.1.1");
    expect(first).toMatchObject({ status: "needs_reason", checks: { location: "outside", ip: "mismatch" } });
    const second = await checkIn(supA, { store_id: storeA, geo: { lat: LAT + 0.05, lng: LNG, accuracy_m: 10 }, reason: "Router down, using my phone data" }, "41.1.1.1");
    expect(second.status).toBe("checked_in");
    const a = await listAlerts(admin, orgId, { open: true });
    expect(a.find((x) => x.kind === "checkin_mismatch")?.body).toContain("Router down");
  });
});

describe("Role-based access is enforced by the server, not hidden by the screen", () => {
  it("a supervisor cannot manage people, checklists, or see reports", async () => {
    await expect(listPeople(supA, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(saveTemplate(supA, orgId, null, { name: "x", cadence: "daily", roles: ["supervisor"], items: [{ label: "xx", answer_type: "tick" }] })).rejects.toMatchObject({ status: 403 });
    await expect(checklistReport(supA, storeA, parseRange())).rejects.toMatchObject({ status: 403 });
    await expect(sos(supA, orgId, parseRange())).rejects.toMatchObject({ status: 403 });
  });
  it("a supervisor cannot check in at a store she is not assigned to", async () => {
    await expect(checkIn(supA, { store_id: storeB, geo: atStore, reason: "x" }, null)).rejects.toMatchObject({ status: 404 });
  });
  it("a shop manager cannot see a store outside her assignment", async () => {
    await expect(checklistReport(shopMgrA, storeB, parseRange())).rejects.toMatchObject({ status: 404 });
    await expect(checklistReport(shopMgrA, storeA, parseRange())).resolves.toBeTruthy();
  });
  it("nobody can see another organisation's store, even its admin", async () => {
    await expect(requireStore(otherAdmin, storeA, "stock.view")).rejects.toMatchObject({ status: 404 });
    await expect(listPeople(otherAdmin, orgId)).rejects.toMatchObject({ status: 404 });
  });
  it("an admin cannot be blocked from a store in their own org", async () => {
    await expect(requireStore(admin, storeB, "reports.view")).resolves.toBeTruthy();
  });
  it("an API key acts only within its role", async () => {
    const { key } = await createApiKey(admin, orgId, "Munch test", "supervisor");
    const k = (await actorFromApiKey(key))!;
    await expect(eventFeed(k, orgId, 0, 10)).rejects.toMatchObject({ status: 403 });
    const { key: adminKey } = await createApiKey(admin, orgId, "Reporting", "admin");
    const feed = await eventFeed((await actorFromApiKey(adminKey))!, orgId, 0, 500);
    expect(feed.events.some((e) => e.type === "checklist_run.submitted")).toBe(true);
    await expect(eventFeed((await actorFromApiKey(adminKey))!, otherOrgId, 0, 10)).rejects.toMatchObject({ status: 404 });
  });
});

describe("Module 2: stock and shop condition", () => {
  it("loads the real smalls list and gives a new shop its starter list", async () => {
    const r = await importSmallsCatalogue(admin, orgId);
    expect(r).toMatchObject({ added: 85, skipped: 0, total: 85 });
    const again = await importSmallsCatalogue(admin, orgId);
    expect(again).toMatchObject({ added: 0, skipped: 85 });
    const s = await applyStarterList(shopMgrA, storeA, { suggestOrder: true });
    expect(s.added).toBe(85);
    const { rows } = await listReorders(shopMgrA, storeA);
    // The opening order totals exactly the order form subtotal (R99,662.50),
    // excluding the items on hold and the lids priced with their trays.
    const total = rows.reduce((t, r) => t + r.qty * (r.unit_price_cents ?? 0), 0);
    const onHold = await one<{ v: number }>(`select coalesce(sum(standard_qty * unit_price_cents), 0)::int as v from catalogue_items where org_id = $1 and notes ilike '%on hold%'`, [orgId]);
    expect(total - onHold!.v).toBe(9966250);
  });

  it("a supervisor marks an item broken: reorder suggested, alerted, visible in the report", async () => {
    await checkIn(supA, { store_id: storeA, geo: atStore }, "196.0.0.10");
    const items = await listStoreItems(supA, storeA);
    const bin = items.find((i) => i.name.startsWith("Mobile refuse bin"))!;
    await expect(reportCondition(supA, { store_item_id: bin.id, condition: "broken", qty: 1, geo: atStore })).rejects.toThrow(/photo/);
    const photo = await uploadPhoto(supA, { storeId: storeA, clientId: randomUUID(), bytes: JPEG });
    const r = await reportCondition(supA, { store_item_id: bin.id, condition: "broken", qty: 1, photo_id: photo.id, note: "Wheel snapped", geo: atStore });
    expect(r.reorder_suggestion_id).toBeTruthy();
    const after = (await listStoreItems(supA, storeA)).find((i) => i.id === bin.id)!;
    expect(after.broken).toBe(1);
    const report = await checklistReport(shopMgrA, storeA, parseRange());
    expect(report.stock.find((s) => s.id === r.report_id)).toMatchObject({ condition: "broken", note: "Wheel snapped" });
  });

  it("only someone with ordering authority can mark a reorder as ordered", async () => {
    const { rows } = await listReorders(supA, storeA);
    const o = rows.find((r) => r.reason === "broken")!;
    await expect(decideReorder(supA, o.id, "ordered", null)).rejects.toMatchObject({ status: 403 });
    await expect(decideReorder(areaMgr, o.id, "ordered", null)).rejects.toMatchObject({ status: 403 });
    await decideReorder(shopMgrA, o.id, "ordered", "Phoned Catercare");
    await expect(decideReorder(shopMgrA, o.id, "dismissed", null)).rejects.toMatchObject({ status: 409 });
  });

  it("a shop walk saves item by item and resumes", async () => {
    const { walk_id } = await startWalk(supA);
    const w = await getWalk(supA, walk_id);
    expect(w.total).toBe(85);
    await reportCondition(supA, { store_item_id: w.items[0].store_item_id, condition: "fine", walk_id, geo: atStore });
    const resumed = await startWalk(supA);
    expect(resumed).toEqual({ walk_id, resumed: true });
    expect((await getWalk(supA, walk_id)).nextIndex).toBe(1);
    await expect(submitWalk(supA, walk_id)).rejects.toThrow(/84 items are not checked/);
  });
});

describe("Library and S.O.S", () => {
  it("loads the client's 46 tasks as drafts, without inventing ranges or tiers", async () => {
    const r = await importStarterChecklists(admin, orgId);
    expect(r.added).toHaveLength(4);
    const items = await q<{ tier: string | null; range_unconfirmed: boolean; min_value: string | null }>(
      `select i.tier, i.range_unconfirmed, i.min_value from template_items i join checklist_templates t on t.id = i.template_id
       where t.org_id = $1 and t.status = 'draft'`, [orgId]);
    expect(items.every((i) => i.tier === null)).toBe(true);
    expect(items.filter((i) => i.range_unconfirmed).every((i) => i.min_value === null)).toBe(true);
  });

  it("S.O.S counts from records and refuses to invent a quality ratio", async () => {
    const s = await sos(areaMgr, orgId, parseRange());
    const a = s.stores.find((x) => x.store_name === "Store A")!;
    expect(a.submitted).toBe(1);
    expect(a.exceptions).toBe(1);
    expect(a.broken).toBe(1);
    expect(a.visits_unconfirmed).toBe(1);
    expect(s.quality_ratio).toEqual({ status: "awaiting_formula" });
    // Supervisor B's store shows nothing done and no invented figures.
    const b = s.stores.find((x) => x.store_name === "Store B")!;
    expect(b.submitted).toBe(0);
  });
});

describe("Photos", () => {
  it("rejects anything that is not really an image, and stores a retried upload once", async () => {
    await expect(uploadPhoto(supA, { storeId: storeA, clientId: randomUUID(), bytes: Buffer.from("<script>alert(1)</script>") })).rejects.toThrow(/not a photo/);
    const id = randomUUID();
    const a = await uploadPhoto(supA, { storeId: storeA, clientId: id, bytes: JPEG });
    const b = await uploadPhoto(supA, { storeId: storeA, clientId: id, bytes: JPEG });
    expect(b).toEqual({ id: a.id, duplicate: true });
  });
});

describe("Check-out", () => {
  it("records where and when she left", async () => {
    const v = await one<{ id: string }>(`select id from visits where user_id = $1 and ended_at is null`, [supA.kind === "user" ? supA.userId : ""]);
    const r = await checkOut(supA, v!.id, { geo: atStore }, "196.0.0.10");
    expect(r).toMatchObject({ already: false, checks: { location: "ok", ip: "match" } });
  });
  it("supervisor B cannot touch supervisor A's visit", async () => {
    const v = await one<{ id: string }>(`select id from visits where user_id = $1 limit 1`, [supA.kind === "user" ? supA.userId : ""]);
    await expect(checkOut(supB, v!.id, {}, null)).rejects.toMatchObject({ status: 404 });
  });
});
