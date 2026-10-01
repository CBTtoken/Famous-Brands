import "server-only";
import { q } from "../db";
import type { Actor } from "../core/auth";
import { requireOrg, requireStore, visibleStores } from "../core/authz";
import { badRequest } from "../core/errors";
import { addDays, localDateStartUtc, periodKey, periodsInRange, todayLocal, localParts, type Cadence } from "../core/time";
import type { Tier } from "../core/tiers";

export function parseRange(from?: string | null, to?: string | null) {
  const today = todayLocal();
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : addDays(t, -6);
  if (f > t) throw badRequest("The start date is after the end date.");
  if (Date.parse(t) - Date.parse(f) > 400 * 86400000) throw badRequest("Choose a range of 400 days or less.");
  return { from: f, to: t, fromUtc: localDateStartUtc(f), toUtc: localDateStartUtc(addDays(t, 1)) };
}

// ---- the detailed checklist report ------------------------------------------------

export type ReportAnswer = {
  position: number; label: string; answer_type: string; tier: Tier | null; unit: string | null;
  min_value: string | null; max_value: string | null; range_unconfirmed: boolean;
  value_bool: boolean | null; value_number: string | null; value_text: string | null; value_date: string | null; value_time: string | null;
  note: string | null; photo_id: string | null; is_exception: boolean; exception_reason: string | null;
  received_at: string | null; client_captured_at: string | null; lat: number | null; lng: number | null; accuracy_m: number | null;
  answered_by: string | null;
};

export type ReportRun = {
  id: string; template_id: string; template_name: string; cadence: Cadence; period_key: string; due_by: string | null;
  status: string; started_at: Date; submitted_at: Date | null; started_by: string; visit_id: string | null;
  answers: ReportAnswer[];
};

export type ReportVisit = {
  id: string; person: string; started_at: Date; ended_at: Date | null; start_location_check: string; start_ip_check: string;
  start_distance_m: number | null; start_lat: number | null; start_lng: number | null; start_accuracy_m: number | null;
  mismatch_reason: string | null; end_location_check: string | null; end_distance_m: number | null;
};

export async function checklistReport(actor: Actor, storeId: string, range: ReturnType<typeof parseRange>, templateId?: string | null) {
  const { store } = await requireStore(actor, storeId, "reports.view");
  const visits = await q<ReportVisit>(
    `select v.id, u.full_name as person, v.started_at, v.ended_at, v.start_location_check, v.start_ip_check, v.start_distance_m,
       v.start_lat, v.start_lng, v.start_accuracy_m, v.mismatch_reason, v.end_location_check, v.end_distance_m
     from visits v join users u on u.id = v.user_id
     where v.store_id = $1 and v.started_at >= $2 and v.started_at < $3 order by v.started_at`,
    [storeId, range.fromUtc, range.toUtc],
  );
  const runs = await q<ReportRun>(
    `select r.id, r.template_id, r.template_name, r.cadence, r.period_key, to_char(r.due_by, 'HH24:MI') as due_by, r.status,
       r.started_at, r.submitted_at, u.full_name as started_by, r.visit_id,
       coalesce((select json_agg(json_build_object(
          'position', i.position, 'label', i.label, 'answer_type', i.answer_type, 'tier', i.tier, 'unit', i.unit,
          'min_value', i.min_value, 'max_value', i.max_value, 'range_unconfirmed', i.range_unconfirmed,
          'value_bool', a.value_bool, 'value_number', a.value_number, 'value_text', a.value_text,
          'value_date', to_char(a.value_date, 'YYYY-MM-DD'), 'value_time', to_char(a.value_time, 'HH24:MI'), 'note', a.note, 'photo_id', a.photo_id,
          'is_exception', coalesce(a.is_exception, false), 'exception_reason', a.exception_reason,
          'received_at', a.received_at, 'client_captured_at', a.client_captured_at, 'lat', a.lat, 'lng', a.lng,
          'accuracy_m', a.accuracy_m, 'answered_by', au.full_name) order by i.position)
         from run_items i left join answers a on a.run_item_id = i.id left join users au on au.id = a.user_id
         where i.run_id = r.id), '[]') as answers
     from checklist_runs r join users u on u.id = r.user_id
     where r.store_id = $1 and r.started_at >= $2 and r.started_at < $3 and ($4::uuid is null or r.template_id = $4)
     order by r.started_at`,
    [storeId, range.fromUtc, range.toUtc, templateId ?? null],
  );
  const stock = await q<{ id: string; item_name: string; condition: string; qty: number; note: string | null; photo_id: string | null;
    reported_by: string; created_at: Date; resolved_at: Date | null }>(
    `select r.id, c.name as item_name, r.condition, r.qty, r.note, r.photo_id, u.full_name as reported_by, r.created_at, r.resolved_at
     from condition_reports r join store_items si on si.id = r.store_item_id join catalogue_items c on c.id = si.catalogue_item_id
     join users u on u.id = r.reported_by
     where r.store_id = $1 and r.condition <> 'fine' and r.created_at >= $2 and r.created_at < $3 order by r.created_at`,
    [storeId, range.fromUtc, range.toUtc],
  );
  return { store, range, visits, runs, stock };
}

export function answerText(a: ReportAnswer): string {
  switch (a.answer_type) {
    case "tick":
      return a.value_bool == null ? "" : a.value_bool ? "Done" : "Not done";
    case "number":
      return a.value_number == null ? "" : `${Number(a.value_number)}${a.unit ? ` ${a.unit}` : ""}`;
    case "date":
      return a.value_date ?? "";
    case "time":
      return a.value_time ?? "";
    case "text":
      return a.value_text ?? "";
    case "photo":
      return a.photo_id ? "Photo taken" : "";
  }
  return "";
}

// ---- S.O.S -------------------------------------------------------------------------

export type StorePerformance = {
  store_id: string; store_name: string; brand: string | null;
  expected: number; submitted: number; on_time: number; in_progress: number; missed: number;
  completion_pct: number | null; on_time_pct: number | null;
  exceptions: number; exceptions_by_tier: Record<string, number>;
  visits: number; visits_unconfirmed: number;
  items: number; items_open_issues: number; broken: number; stolen: number; worn: number; service_overdue: number;
  open_reorders: number; open_reorder_value_cents: number;
  repeat_offences: { label: string; template_name: string; periods: number }[];
  weekly: { week: string; expected: number; submitted: number }[];
};

/**
 * The S.O.S roll-up: every figure is counted from records, nothing estimated.
 * "Expected" counts each published checklist once per period it applied to,
 * from the day it was first published or created, whichever is later in the
 * range. The current period is only counted once its due time has passed.
 */
export async function sos(actor: Actor, orgId: string, range: ReturnType<typeof parseRange>, storeId?: string | null) {
  requireOrg(actor, orgId, "reports.view");
  let stores = await visibleStores(actor, orgId);
  if (storeId) stores = stores.filter((s) => s.id === storeId);
  const now = new Date();
  const nowLocal = localParts(now);
  const out: StorePerformance[] = [];

  for (const s of stores.filter((x) => x.active || storeId)) {
    const templates = await q<{ id: string; cadence: Cadence; due_by: string | null; created_at: Date }>(
      `select t.id, t.cadence, to_char(t.due_by, 'HH24:MI') as due_by, t.created_at from checklist_templates t
       where t.org_id = $1 and t.status = 'published' and t.cadence <> 'as_needed'
         and (not exists (select 1 from template_stores ts where ts.template_id = t.id)
              or exists (select 1 from template_stores ts where ts.template_id = t.id and ts.store_id = $2))`,
      [orgId, s.id],
    );
    const runs = await q<{ template_id: string; period_key: string; status: string; submitted_at: Date | null; due_by: string | null; cadence: Cadence }>(
      `select template_id, period_key, status, submitted_at, to_char(due_by, 'HH24:MI') as due_by, cadence from checklist_runs
       where store_id = $1 and cadence <> 'as_needed'`,
      [s.id],
    );
    const runByKey = new Map(runs.map((r) => [`${r.template_id}|${r.period_key}`, r]));
    let expected = 0, submitted = 0, onTime = 0, inProgress = 0, missed = 0;
    const weekly = new Map<string, { expected: number; submitted: number }>();
    for (const t of templates) {
      const startDate = localParts(t.created_at).date > range.from ? localParts(t.created_at).date : range.from;
      if (startDate > range.to) continue;
      const currentKey = periodKey(t.cadence, now);
      for (const pk of periodsInRange(t.cadence, startDate, range.to)) {
        const run = runByKey.get(`${t.id}|${pk}`);
        // The period running now only counts once it is overdue (daily with a
        // due time that has passed), or once it has been done.
        if (pk === currentKey && !(run?.status === "submitted")) {
          const overdue = t.cadence === "daily" && t.due_by && nowLocal.time > t.due_by;
          if (!overdue) {
            if (run) inProgress++;
            continue;
          }
        }
        expected++;
        const wk = t.cadence === "daily" ? periodKey("weekly", new Date(`${pk}T12:00:00Z`), "UTC") : null;
        if (wk) weekly.set(wk, { expected: (weekly.get(wk)?.expected ?? 0) + 1, submitted: weekly.get(wk)?.submitted ?? 0 });
        if (run?.status === "submitted") {
          submitted++;
          if (wk) weekly.get(wk)!.submitted++;
          const late = t.cadence === "daily" && run.due_by && run.submitted_at &&
            (localParts(run.submitted_at).date > pk || (localParts(run.submitted_at).date === pk && localParts(run.submitted_at).time > run.due_by));
          if (!late) onTime++;
        } else {
          missed++;
        }
      }
    }
    const exc = await q<{ tier: Tier | null; n: number }>(
      `select i.tier, count(*)::int as n from answers a join run_items i on i.id = a.run_item_id join checklist_runs r on r.id = a.run_id
       where r.store_id = $1 and a.is_exception and a.received_at >= $2 and a.received_at < $3 group by i.tier`,
      [s.id, range.fromUtc, range.toUtc],
    );
    const v = (await q<{ visits: number; unconfirmed: number }>(
      `select count(*)::int as visits, count(*) filter (where mismatch_reason is not null)::int as unconfirmed
       from visits where store_id = $1 and started_at >= $2 and started_at < $3`,
      [s.id, range.fromUtc, range.toUtc],
    ))[0];
    const st = (await q<{ items: number; open_issues: number; broken: number; stolen: number; worn: number; overdue: number }>(
      `select (select count(*)::int from store_items where store_id = $1) as items,
         (select count(distinct store_item_id)::int from condition_reports where store_id = $1 and condition <> 'fine' and resolved_at is null) as open_issues,
         coalesce((select sum(qty)::int from condition_reports where store_id = $1 and condition = 'broken' and resolved_at is null), 0) as broken,
         coalesce((select sum(qty)::int from condition_reports where store_id = $1 and condition = 'stolen' and resolved_at is null), 0) as stolen,
         coalesce((select sum(qty)::int from condition_reports where store_id = $1 and condition = 'worn' and resolved_at is null), 0) as worn,
         (select count(*)::int from store_items where store_id = $1 and next_service_date < $2::date) as overdue`,
      [s.id, todayLocal()],
    ))[0];
    const ro = (await q<{ n: number; value: number }>(
      `select count(*)::int as n, coalesce(sum(qty * coalesce(unit_price_cents, 0)), 0)::bigint as value
       from reorder_suggestions where store_id = $1 and status = 'open'`,
      [s.id],
    ))[0];
    const repeat = await q<{ label: string; template_name: string; periods: number }>(
      `select i.label, r.template_name, count(distinct r.period_key)::int as periods
       from answers a join run_items i on i.id = a.run_item_id join checklist_runs r on r.id = a.run_id
       where r.store_id = $1 and a.is_exception and a.received_at >= $2 and a.received_at < $3
       group by i.label, r.template_name having count(distinct r.period_key) >= 3 order by periods desc limit 10`,
      [s.id, range.fromUtc, range.toUtc],
    );
    out.push({
      store_id: s.id, store_name: s.name, brand: s.brand,
      expected, submitted, on_time: onTime, in_progress: inProgress, missed,
      completion_pct: expected ? Math.round((submitted / expected) * 1000) / 10 : null,
      on_time_pct: submitted ? Math.round((onTime / submitted) * 1000) / 10 : null,
      exceptions: exc.reduce((a, e) => a + e.n, 0),
      exceptions_by_tier: Object.fromEntries(exc.map((e) => [e.tier ?? "none", e.n])),
      visits: v.visits, visits_unconfirmed: v.unconfirmed,
      items: st.items, items_open_issues: st.open_issues, broken: st.broken, stolen: st.stolen, worn: st.worn, service_overdue: st.overdue,
      open_reorders: ro.n, open_reorder_value_cents: Number(ro.value),
      repeat_offences: repeat,
      weekly: [...weekly.entries()].sort().map(([week, w]) => ({ week, ...w })),
    });
  }
  return {
    range,
    stores: out,
    // Deliberately no number. The handoff says the weighting must come from
    // Dewald; until it does, the screen shows what will feed it, not a score.
    quality_ratio: { status: "awaiting_formula" as const },
  };
}
