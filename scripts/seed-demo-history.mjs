// Adds a demo Debonairs franchise with simulated history, for showing how the
// screens and reports look before a real pilot shop exists. Asked for by
// Dewald on 1 October 2026.
//
//   node scripts/seed-demo-history.mjs [days]      (default 14)
//
// Everything it makes is labelled as demo: the group is flagged is_demo (a
// banner shows on every screen inside it), every name starts with DEMO, every
// photo is a grey card that says "DEMO PHOTO", logins use the reserved
// .invalid domain, and every record it writes is listed in the event log as
// demo.history_simulated. It never touches any other group, and refuses to
// run twice.
//
// It writes straight to the database because the history it simulates is in
// the past, which the app's own API rightly refuses to do (server time is the
// time). The rows follow the same shapes the services write: a check-in per
// visit, the checklist frozen into run items, one answer per item judged by
// the same rules, alerts for problems, and the run locked once submitted.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hash } from "@node-rs/argon2";

const here = dirname(fileURLToPath(import.meta.url));
const DAYS = Math.max(1, Math.min(60, Number(process.argv[2] ?? 14)));
const ORG_NAME = "DEMO Debonairs franchise (simulated data)";
const DOMAIN = "debonairs-demo.invalid";
const TZ_OFFSET_H = 2; // Africa/Johannesburg, no daylight saving

// ---- a repeatable random, so a re-seed on a fresh database looks the same ----
let seed = 20261001;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);

const SHOPS = [
  { key: "boksburg", name: "DEMO Debonairs Boksburg", lat: -26.2125, lng: 28.2596, sup: "Lerato", reliability: 0.97 },
  { key: "benoni", name: "DEMO Debonairs Benoni", lat: -26.1885, lng: 28.3207, sup: "Sipho", reliability: 0.95 },
  { key: "germiston", name: "DEMO Debonairs Germiston", lat: -26.2195, lng: 28.1627, sup: "Anele", reliability: 0.92 },
  { key: "kempton", name: "DEMO Debonairs Kempton Park", lat: -26.1007, lng: 28.2295, sup: "Johan", reliability: 0.78 },
  { key: "brakpan", name: "DEMO Debonairs Brakpan", lat: -26.2366, lng: 28.3694, sup: "Nomsa", reliability: 0.9 },
];

// The client's own daily tasks (Store_Supervision_Functional_Spec_Draft1),
// worded as he wrote them. Only rules the client gave are set: "flagged after
// 09:00" for opening time. The fridge range was marked CONFIRM, so it stays
// unconfirmed and readings are recorded but never judged.
const ITEMS = [
  { label: "Confirm outlet opened on time (by 09:00)", answer_type: "time", tier: "important", latest_time: "09:00", help_text: "Type the time the doors opened." },
  { label: "Ensure staff in correct uniform and hygiene", answer_type: "tick", tier: "important", photo_rule: "never" },
  { label: "Spot-check expiry dates, storage, cold-chain", answer_type: "tick", tier: "urgent", photo_rule: "on_exception" },
  { label: "Check fridge and freezer temperatures", answer_type: "number", unit: "°C", range_unconfirmed: true, help_text: "Walk-in fridge reading. CONFIRM the allowed range." },
  { label: "Ensure fire extinguishers and first-aid kits usable", answer_type: "tick", tier: "critical", photo_rule: "on_exception" },
  { label: "Confirm outlet cleanliness", answer_type: "tick", tier: "important", photo_rule: "always" },
  { label: "Ensure promotions and menus displayed correctly", answer_type: "tick", tier: "be_aware", photo_rule: "always" },
  { label: "Check drivers' reports, sign off meeting notes", answer_type: "text" },
];

const NOT_DONE_NOTES = {
  "Ensure staff in correct uniform and hygiene": ["Two staff without caps. Sent to fetch them.", "New driver had no name badge.", "One apron missing, ordered."],
  "Spot-check expiry dates, storage, cold-chain": ["Cheese tub past date, thrown away.", "Freezer door not closing properly.", "Sauces stored on the floor, moved."],
  "Ensure fire extinguishers and first-aid kits usable": ["Extinguisher pin missing.", "First-aid kit empty, no plasters."],
  "Confirm outlet cleanliness": ["Front counter dirty from last night.", "Back door area not swept."],
  "Ensure promotions and menus displayed correctly": ["Old promotion still on the window.", "Menu board light not working."],
};
const DRIVER_NOTES = ["Signed off. Nothing to report.", "All drivers checked in. One bike needs a new tyre.", "Meeting notes signed. Delivery times discussed.", "Signed off. Driver short today, covered by shift lead.", "Signed off."];

const password = () => `Demo-${randomBytes(4).toString("hex")}-${randomBytes(2).toString("hex")}`;
const distanceM = (aLat, aLng, bLat, bLng) => {
  const R = 6371000, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};
/** A moment on a store-local date, at hh:mm local, as a real Date. */
const at = (date, minutes) => new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - TZ_OFFSET_H * 60) * 60000);
const localDate = (d) => new Date(d.getTime() + TZ_OFFSET_H * 3600000).toISOString().slice(0, 10);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const photoDir = resolve(process.env.STORAGE_LOCAL_DIR ?? "./.data/photos");
  const photoBytes = readFileSync(join(here, "demo-photo.jpg"));
  const photoSha = createHash("sha256").update(photoBytes).digest("hex");
  // Beside this script in the container image; in the repository it lives with the app's library.
  const catPath = [join(here, "smalls-catalogue.json"), join(here, "..", "src", "lib", "library", "smalls-catalogue.json")].find((p) => existsSync(p));
  const catalogue = JSON.parse(readFileSync(catPath, "utf8"));

  const exists = await c.query(`select id from organisations where name = $1`, [ORG_NAME]);
  if (exists.rows.length) {
    console.log(`Not run: "${ORG_NAME}" already exists. Nothing was changed.`);
    await c.end();
    return;
  }

  const now = new Date();
  const today = localDate(now);
  const startDate = localDate(new Date(now.getTime() - DAYS * 86400000));
  const setupAt = at(startDate, 6 * 60); // everything existed from 06:00 on the first day
  const q = (sql, params) => c.query(sql, params).then((r) => r.rows);
  const one = async (sql, params) => (await q(sql, params))[0];
  const counts = { visits: 0, runs: 0, late: 0, missed: 0, answers: 0, problems: 0, photos: 0, alerts: 0, reports: 0 };
  const logins = [];

  await c.query("begin");
  try {
    const org = await one(`insert into organisations (name, is_demo, created_at) values ($1, true, $2) returning id`, [ORG_NAME, setupAt]);
    const orgId = org.id;

    // ---- people ----
    const mkUser = async (fullName, login, role) => {
      const pw = password();
      const u = await one(
        `insert into users (full_name, email, password_hash, must_change_password, created_at) values ($1,$2,$3,false,$4) returning id`,
        [fullName, `${login}@${DOMAIN}`, await hash(pw), setupAt],
      );
      await q(`insert into memberships (org_id, user_id, role, created_at) values ($1,$2,$3,$4)`, [orgId, u.id, role, setupAt]);
      logins.push({ name: fullName, role, login: `${login}@${DOMAIN}`, password: pw });
      return u.id;
    };
    const ownerId = await mkUser("DEMO Owner", "owner", "admin");

    // ---- shops and their supervisors ----
    for (const s of SHOPS) {
      const st = await one(
        `insert into stores (org_id, name, brand, address, latitude, longitude, geofence_m, created_at)
         values ($1,$2,'Debonairs Pizza',$3,$4,$5,150,$6) returning id`,
        [orgId, s.name, `Not a real address. Demo shop in ${s.name.replace("DEMO Debonairs ", "")}.`, s.lat, s.lng, setupAt],
      );
      s.id = st.id;
      s.userId = await mkUser(`DEMO ${s.sup} (supervisor, ${s.name.replace("DEMO Debonairs ", "")})`, `supervisor.${s.key}`, "supervisor");
      s.supName = `DEMO ${s.sup} (supervisor, ${s.name.replace("DEMO Debonairs ", "")})`;
      await q(`insert into store_assignments (user_id, store_id, can_order, created_at) values ($1,$2,false,$3)`, [s.userId, s.id, setupAt]);
      await q(`insert into store_assignments (user_id, store_id, can_order, created_at) values ($1,$2,true,$3)`, [ownerId, s.id, setupAt]);
    }

    // ---- who hears about what ----
    for (const tier of ["critical", "urgent", "important"]) {
      await q(`insert into notification_rules (org_id, tier, recipient_role, push) values ($1,$2,'admin',true)`, [orgId, tier]);
    }

    // ---- the daily checklist: start 08:00, done by 10:00 ----
    const tpl = await one(
      `insert into checklist_templates (org_id, name, category, cadence, due_by, roles, status, created_by, created_at, updated_at, published_at)
       values ($1,'Daily opening checks','Opening checks','daily','10:00','{supervisor}','published',$2,$3,$3,$3) returning id`,
      [orgId, ownerId, setupAt],
    );
    let pos = 0;
    for (const it of ITEMS) {
      await q(
        `insert into template_items (template_id, position, label, help_text, answer_type, tier, unit, range_unconfirmed, photo_rule, latest_time, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tpl.id, ++pos, it.label, it.help_text ?? null, it.answer_type, it.tier ?? null, it.unit ?? null, it.range_unconfirmed ?? false,
          it.photo_rule ?? "never", it.latest_time ?? null, setupAt],
      );
    }

    // ---- items: the standard smalls list in every shop ----
    const sup = await one(`insert into suppliers (org_id, name, notes, created_at) values ($1,$2,$3,$4) returning id`,
      [orgId, catalogue.supplier, "Supplier on the Debonairs smalls standard list order form, October 2025.", setupAt]);
    const catIds = [];
    for (const it of catalogue.items) {
      const r = await one(
        `insert into catalogue_items (org_id, code, name, category, unit_price_cents, price_source, default_supplier_id, standard_qty, notes, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, name, standard_qty, unit_price_cents, category`,
        [orgId, it.code, it.name, it.category, it.unit_price_cents, it.price_source, sup.id, it.standard_qty, it.notes, setupAt],
      );
      if (r.standard_qty > 0) catIds.push(r);
    }
    for (const s of SHOPS) {
      s.items = [];
      for (const it of catIds) {
        const area = /clean|hygiene/i.test(it.category) ? "back" : "kitchen";
        const r = await one(`insert into store_items (store_id, catalogue_item_id, area, par_qty, created_at) values ($1,$2,$3,$4,$5) returning id`,
          [s.id, it.id, area, it.standard_qty, setupAt]);
        s.items.push({ id: r.id, name: it.name, price: it.unit_price_cents });
      }
    }

    const items = await q(`select * from template_items where template_id = $1 order by position`, [tpl.id]);
    const savePhoto = async (s, when, lat, lng) => {
      const key = `${orgId}/${s.id}/${when.getUTCFullYear()}/${String(when.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.jpg`;
      mkdirSync(dirname(join(photoDir, key)), { recursive: true });
      writeFileSync(join(photoDir, key), photoBytes);
      const p = await one(
        `insert into photos (org_id, store_id, client_id, storage_key, sha256, bytes, mime, width, height, lat, lng, accuracy_m, client_captured_at, uploaded_by, created_at)
         values ($1,$2,$3,$4,$5,$6,'image/jpeg',640,480,$7,$8,$9,$10,$11,$10) returning id`,
        [orgId, s.id, randomUUID(), key, photoSha, photoBytes.length, lat, lng, Math.round(between(6, 25)), when, s.userId],
      );
      counts.photos++;
      return p.id;
    };

    // ---- the simulated days ----
    for (let d = DAYS; d >= 0; d--) {
      const date = localDate(new Date(now.getTime() - d * 86400000));
      for (const s of SHOPS) {
        if (rnd() > s.reliability + 0.03) { counts.missed++; continue; } // nobody did it that day
        const late = rnd() > s.reliability;
        const checkIn = between(7 * 60 + 50, 8 * 60 + 15) + (late ? between(90, 120) : 0);
        const submitM = late ? between(10 * 60 + 5, 10 * 60 + 50) : between(8 * 60 + 35, 9 * 60 + 50);
        if (at(date, submitM + 20) > now) continue; // today, not happened yet
        const outside = rnd() < 0.04;
        const lat = s.lat + (outside ? 0.02 : between(-0.0004, 0.0004));
        const lng = s.lng + (outside ? 0.02 : between(-0.0004, 0.0004));
        const dist = distanceM(s.lat, s.lng, lat, lng);
        const v = await one(
          `insert into visits (org_id, store_id, user_id, started_at, client_started_at, start_lat, start_lng, start_accuracy_m,
             start_location_check, start_ip_check, start_distance_m, mismatch_reason,
             ended_at, client_ended_at, end_lat, end_lng, end_accuracy_m, end_location_check, end_ip_check, end_distance_m)
           values ($1,$2,$3,$4,$4,$5,$6,$7,$8,'store_has_no_ip',$9,$10,$11,$11,$12,$13,$7,'ok','store_has_no_ip',$14) returning id`,
          [orgId, s.id, s.userId, at(date, checkIn), lat, lng, Math.round(between(8, 30)), outside ? "outside" : "ok", dist,
            outside ? pick(["Phone location was wrong, I am at the shop.", "GPS slow this morning, inside the shop."]) : null,
            at(date, submitM + between(10, 30)), s.lat + between(-0.0003, 0.0003), s.lng + between(-0.0003, 0.0003), Math.round(between(10, 40))],
        );
        counts.visits++;
        if (outside) {
          await q(`insert into alerts (org_id, store_id, tier, kind, title, body, source_type, source_id, link, created_by, created_at, acknowledged_by, acknowledged_at)
                   values ($1,$2,'important','checkin_mismatch',$3,$4,'visit',$5,$6,$7,$8,$9,$10)`,
            [orgId, s.id, `Check-in not confirmed at ${s.name}`, `Phone was ${dist} m from the shop. Reason given: recorded on the visit.`, v.id,
              `/reports/visits/${v.id}`, s.userId, at(date, checkIn), d > 1 ? ownerId : null, d > 1 ? at(date, checkIn + 45) : null]);
          counts.alerts++;
        }
        const runStart = checkIn + between(2, 6);
        const run = await one(
          `insert into checklist_runs (org_id, store_id, template_id, visit_id, user_id, period_key, template_name, cadence, due_by, started_at)
           values ($1,$2,$3,$4,$5,$6,'Daily opening checks','daily','10:00',$7) returning id`,
          [orgId, s.id, tpl.id, v.id, s.userId, date, at(date, runStart)],
        );
        const runItems = [];
        for (const it of items) {
          const ri = await one(
            `insert into run_items (run_id, template_item_id, position, label, help_text, answer_type, tier, unit, min_value, max_value,
               range_unconfirmed, photo_rule, date_mode, date_warn_days, latest_time)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
            [run.id, it.id, it.position, it.label, it.help_text, it.answer_type, it.tier, it.unit, it.min_value, it.max_value,
              it.range_unconfirmed, it.photo_rule, it.date_mode, it.date_warn_days, it.latest_time],
          );
          runItems.push({ ...it, runItemId: ri.id });
        }
        // Answers spread evenly between starting and sending.
        const step = (submitM - 3 - runStart) / runItems.length;
        let m = runStart;
        const sloppy = (1 - s.reliability) * 0.6; // weaker shops find more problems
        for (const it of runItems) {
          m += step * between(0.6, 1.2);
          const when = at(date, m);
          const aLat = s.lat + between(-0.0003, 0.0003), aLng = s.lng + between(-0.0003, 0.0003);
          let vb = null, vn = null, vt = null, vtime = null, note = null, photo = null, exc = false, reason = null;
          if (it.answer_type === "time") {
            const opened = rnd() < 0.05 + sloppy ? between(9 * 60 + 2, 9 * 60 + 25) : between(8 * 60 + 40, 8 * 60 + 59);
            vtime = hhmm(opened);
            if (vtime > "09:00") { exc = true; reason = `${vtime} is after 09:00`; note = pick(["Staff arrived late.", "Load shedding, tills slow to start.", "Key holder late."]); }
          } else if (it.answer_type === "tick") {
            const bad = rnd() < (it.tier === "critical" ? 0.015 : 0.04) + sloppy;
            vb = !bad;
            if (bad) { exc = true; reason = "Marked not done"; note = pick(NOT_DONE_NOTES[it.label] ?? ["Not done today."]); }
            if (it.photo_rule === "always" || (bad && it.photo_rule === "on_exception")) photo = await savePhoto(s, when, aLat, aLng);
          } else if (it.answer_type === "number") {
            vn = Math.round(between(2, 5.5) * 10) / 10 + (rnd() < sloppy ? 4 : 0);
          } else if (it.answer_type === "text") {
            vt = pick(DRIVER_NOTES);
          }
          const a = await one(
            `insert into answers (run_id, run_item_id, user_id, value_bool, value_number, value_text, value_time, note, photo_id,
               is_exception, exception_reason, lat, lng, accuracy_m, client_captured_at, received_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$15) returning id`,
            [run.id, it.runItemId, s.userId, vb, vn, vt, vtime, note, photo, exc, reason, aLat, aLng, Math.round(between(6, 25)), when],
          );
          counts.answers++;
          if (exc) {
            counts.problems++;
            await q(`insert into alerts (org_id, store_id, tier, kind, title, body, source_type, source_id, link, created_by, created_at, acknowledged_by, acknowledged_at)
                     values ($1,$2,$3,'checklist_exception',$4,$5,'run_item',$6,$7,$8,$9,$10,$11)`,
              [orgId, s.id, it.tier, it.label, `${reason}. Recorded by ${s.supName}.${note ? ` Note: "${note}"` : ""}`, it.runItemId,
                `/reports/runs/${run.id}`, s.userId, when, d > 1 ? ownerId : null, d > 1 ? new Date(when.getTime() + between(10, 90) * 60000) : null]);
            counts.alerts++;
            void a;
          }
        }
        await q(`update checklist_runs set status = 'submitted', submitted_at = $2 where id = $1`, [run.id, at(date, submitM)]);
        counts.runs++;
        if (late) counts.late++;
      }
    }

    // ---- a few items reported broken, stolen or worn, some dealt with ----
    const reports = [
      [3, 0, "MOBILE REFUSE BIN 240", "broken", 1, "Wheel came off.", true],
      [3, 9, "PIZZA CUTTER", "stolen", 2, "Two cutters missing after the weekend.", false],
      [1, 6, "THERMOMETER THERMAPEN", "broken", 1, "Display not working.", false],
      [2, 4, "MOP ROUND", "worn", 2, "Mop heads worn through.", true],
      [4, 2, "DOUGH TRAY", "worn", 6, "Cracked trays, not safe for food.", false],
      [0, 11, "WET FLOOR SIGN", "stolen", 1, "Sign taken from outside the door.", false],
    ];
    for (const [shopIdx, daysAgo, match, condition, qty, note, resolved] of reports) {
      const s = SHOPS[shopIdx];
      const item = s.items.find((i) => i.name.toUpperCase().includes(match));
      if (!item) continue;
      const when = at(localDate(new Date(now.getTime() - daysAgo * 86400000)), between(8 * 60 + 20, 9 * 60 + 40));
      if (when > now) continue;
      const photo = await savePhoto(s, when, s.lat, s.lng);
      const r = await one(
        `insert into condition_reports (org_id, store_id, store_item_id, condition, qty, note, photo_id, lat, lng, accuracy_m, client_captured_at, reported_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,12,$10,$11,$10) returning id`,
        [orgId, s.id, item.id, condition, qty, note, photo, s.lat, s.lng, when, s.userId],
      );
      counts.reports++;
      await q(`insert into reorder_suggestions (org_id, store_id, store_item_id, supplier_id, qty, unit_price_cents, reason, source_report_id, status, created_by, created_at, decided_by, decided_at, decision_note)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [orgId, s.id, item.id, sup.id, qty, item.price, condition, r.id, resolved ? "ordered" : "open", s.userId, when,
          resolved ? ownerId : null, resolved ? new Date(when.getTime() + 3 * 3600000) : null, resolved ? "Ordered from Catercare." : null]);
      if (resolved) {
        await q(`update condition_reports set resolved_at = $2, resolved_by = $3, resolution_note = 'Replaced.' where id = $1`,
          [r.id, new Date(when.getTime() + 2 * 86400000), ownerId]);
      }
      const tier = condition === "stolen" ? "urgent" : condition === "broken" ? "important" : "be_aware";
      await q(`insert into alerts (org_id, store_id, tier, kind, title, body, source_type, source_id, link, created_by, created_at, acknowledged_by, acknowledged_at)
               values ($1,$2,$3,'stock_condition',$4,$5,'condition_report',$6,$7,$8,$9,$10,$11)`,
        [orgId, s.id, tier, `${item.name}: ${condition}`, `${qty} reported ${condition} by ${s.supName}. ${note}`, r.id, `/stock?store=${s.id}`, s.userId, when,
          resolved ? ownerId : null, resolved ? new Date(when.getTime() + 3600000) : null]);
      counts.alerts++;
    }

    await q(`insert into events (org_id, actor_user_id, type, entity_type, entity_id, payload) values ($1,null,'demo.history_simulated','organisation',$1,$2)`,
      [orgId, JSON.stringify({ days: DAYS, from: startDate, to: today, ...counts, note: "Simulated demo data, not real shop records." })]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
  await c.end();

  console.log(`Made "${ORG_NAME}": ${SHOPS.length} shops, ${DAYS + 1} days from ${startDate} to ${today}.`);
  console.log(`Checklists sent: ${counts.runs} (${counts.late} after 10:00), not done: ${counts.missed}. Answers: ${counts.answers}, problems: ${counts.problems}.`);
  console.log(`Visits: ${counts.visits}. Demo photos: ${counts.photos}. Item reports: ${counts.reports}. Alerts: ${counts.alerts}.`);
  console.log("Sign-ins (demo only):");
  for (const l of logins) console.log(`  ${l.name} | ${l.role} | ${l.login} | ${l.password}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
