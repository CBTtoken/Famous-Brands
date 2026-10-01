import "server-only";
import { z } from "zod";
import { one, q, tx } from "../db";
import type { Actor } from "../core/auth";
import { actorUserId, requireStore, roleIn, roleCan, type Role } from "../core/authz";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import { evaluateAnswer, type ItemRules } from "../core/evaluate";
import { recordEvent } from "../core/events";
import { periodKey, todayLocal, type Cadence } from "../core/time";
import type { Tier } from "../core/tiers";
import { raiseAlert } from "./alerts";
import { activeVisit, geoInput } from "./visits";

export type DueChecklist = {
  template_id: string; name: string; category: string; cadence: Cadence; due_by: string | null; items: number;
  run_id: string | null; run_status: "in_progress" | "submitted" | null; answered: number; started_by: string | null;
};

async function requireOpenVisitAt(actor: Actor, storeId: string) {
  const v = await activeVisit(actor);
  if (!v || v.store_id !== storeId) throw badRequest("Check in at this store first.");
  return v;
}

/** The checklists this person is asked to do at the store they are checked in at, for this period. */
export async function dueChecklists(actor: Actor, visitId: string): Promise<DueChecklist[]> {
  const v = await activeVisit(actor);
  if (!v || v.id !== visitId) throw badRequest("This visit is closed. Check in again.");
  const role = roleIn(actor, v.org_id) as Role;
  const templates = await q<{ id: string; name: string; category: string; cadence: Cadence; due_by: string | null; items: number }>(
    `select t.id, t.name, t.category, t.cadence, to_char(t.due_by, 'HH24:MI') as due_by,
       (select count(*)::int from template_items i where i.template_id = t.id and not i.retired) as items
     from checklist_templates t
     where t.org_id = $1 and t.status = 'published' and $3 = any(t.roles)
       and (not exists (select 1 from template_stores ts where ts.template_id = t.id)
            or exists (select 1 from template_stores ts where ts.template_id = t.id and ts.store_id = $2))
     order by case t.cadence when 'daily' then 0 when 'weekly' then 1 when 'monthly' then 2 when 'quarterly' then 3
       when 'six_monthly' then 4 else 5 end, t.due_by nulls last, t.category, t.name`,
    [v.org_id, v.store_id, role],
  );
  const out: DueChecklist[] = [];
  for (const t of templates) {
    const run =
      t.cadence === "as_needed"
        ? await one<{ id: string; status: "in_progress" | "submitted"; answered: number; started_by: string }>(
            `select r.id, r.status, (select count(*)::int from answers a where a.run_id = r.id) as answered, u.full_name as started_by
             from checklist_runs r join users u on u.id = r.user_id
             where r.template_id = $1 and r.visit_id = $2 and r.status = 'in_progress' order by r.started_at desc limit 1`,
            [t.id, v.id],
          )
        : await one<{ id: string; status: "in_progress" | "submitted"; answered: number; started_by: string }>(
            `select r.id, r.status, (select count(*)::int from answers a where a.run_id = r.id) as answered, u.full_name as started_by
             from checklist_runs r join users u on u.id = r.user_id
             where r.template_id = $1 and r.store_id = $2 and r.period_key = $3`,
            [t.id, v.store_id, periodKey(t.cadence)],
          );
    out.push({ template_id: t.id, name: t.name, category: t.category, cadence: t.cadence, due_by: t.due_by, items: t.items,
      run_id: run?.id ?? null, run_status: run?.status ?? null, answered: run?.answered ?? 0, started_by: run?.started_by ?? null });
  }
  return out;
}

/** Start a checklist, or carry on with the one already started for this period. */
export async function startRun(actor: Actor, templateId: string) {
  const userId = actorUserId(actor);
  const v = await activeVisit(actor);
  if (!v) throw badRequest("Check in at the store first.");
  const t = await one<{ id: string; org_id: string; name: string; cadence: Cadence; due_by: string | null; roles: Role[]; status: string }>(
    `select id, org_id, name, cadence, due_by, roles, status from checklist_templates where id = $1`,
    [templateId],
  );
  if (!t || t.org_id !== v.org_id || t.status !== "published") throw notFound("That checklist");
  const role = roleIn(actor, t.org_id) as Role;
  if (!t.roles.includes(role)) throw forbidden("This checklist is not one your role is asked to do.");
  const applies = await one(
    `select 1 where not exists (select 1 from template_stores where template_id = $1)
       or exists (select 1 from template_stores where template_id = $1 and store_id = $2)`,
    [templateId, v.store_id],
  );
  if (!applies) throw notFound("That checklist");

  const key = periodKey(t.cadence);
  if (t.cadence !== "as_needed") {
    const existing = await one<{ id: string; status: string }>(
      `select id, status from checklist_runs where template_id = $1 and store_id = $2 and period_key = $3`,
      [templateId, v.store_id, key],
    );
    if (existing) {
      if (existing.status === "submitted") throw conflict(`${t.name} is already done for this period.`);
      return { run_id: existing.id, resumed: true };
    }
  }
  try {
    const runId = await tx(async (c) => {
      const r = await one<{ id: string }>(
        `insert into checklist_runs (org_id, store_id, template_id, visit_id, user_id, period_key, template_name, cadence, due_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [t.org_id, v.store_id, t.id, v.id, userId, key, t.name, t.cadence, t.due_by],
        c,
      );
      // Freeze the questions as they are right now.
      await q(
        `insert into run_items (run_id, template_item_id, position, label, help_text, answer_type, tier, unit, min_value, max_value,
           range_unconfirmed, photo_rule, date_mode, date_warn_days, latest_time)
         select $1, id, row_number() over (order by position), label, help_text, answer_type, tier, unit, min_value, max_value,
           range_unconfirmed, photo_rule, date_mode, date_warn_days, latest_time
         from template_items where template_id = $2 and not retired`,
        [r!.id, t.id],
        c,
      );
      await recordEvent(actor, t.org_id, "checklist_run.started", "checklist_run", r!.id, { template_id: t.id, store_id: v.store_id, period: key }, c);
      return r!.id;
    });
    return { run_id: runId, resumed: false };
  } catch (e) {
    // Two phones pressed start at the same moment: use the one that won.
    if ((e as { code?: string }).code === "23505") {
      const existing = await one<{ id: string }>(
        `select id from checklist_runs where template_id = $1 and store_id = $2 and period_key = $3`,
        [templateId, v.store_id, key],
      );
      if (existing) return { run_id: existing.id, resumed: true };
    }
    throw e;
  }
}

export type RunItem = ItemRules & {
  id: string; position: number; help_text: string | null; tier: Tier | null;
  answer: null | {
    value_bool: boolean | null; value_number: string | null; value_text: string | null; value_date: string | null; value_time: string | null;
    note: string | null; photo_id: string | null; is_exception: boolean; exception_reason: string | null;
    received_at: Date; client_captured_at: Date | null; lat: number | null; lng: number | null; accuracy_m: number | null;
    answered_by: string;
  };
  complete: boolean;
};

export async function getRun(actor: Actor, runId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw notFound("That checklist");
  const run = await one<{
    id: string; org_id: string; store_id: string; store_name: string; template_id: string; template_name: string; cadence: Cadence;
    period_key: string; due_by: string | null; status: "in_progress" | "submitted"; started_at: Date; submitted_at: Date | null;
    user_id: string; started_by: string; visit_id: string | null;
  }>(
    `select r.id, r.org_id, r.store_id, s.name as store_name, r.template_id, r.template_name, r.cadence, r.period_key,
       to_char(r.due_by, 'HH24:MI') as due_by, r.status, r.started_at, r.submitted_at, r.user_id, u.full_name as started_by, r.visit_id
     from checklist_runs r join stores s on s.id = r.store_id join users u on u.id = r.user_id where r.id = $1`,
    [runId],
  );
  if (!run) throw notFound("That checklist");
  const access = await requireStore(actor, run.store_id, "visit.checkin");
  // A supervisor sees checklists at her stores; reports roles see all of them.
  if (!roleCan(access.role, "reports.view") && actor.kind === "user" && run.user_id !== actor.userId) {
    const touched = await one(`select 1 from answers where run_id = $1 and user_id = $2 limit 1`, [runId, actor.userId]);
    if (!touched && run.status === "submitted") throw notFound("That checklist");
  }
  const rows = await q<RunItem & { a_id: string | null }>(
    `select i.id, i.position, i.label, i.help_text, i.answer_type, i.tier, i.unit, i.min_value, i.max_value, i.range_unconfirmed,
       i.photo_rule, i.date_mode, i.date_warn_days, to_char(i.latest_time, 'HH24:MI') as latest_time,
       case when a.id is null then null else json_build_object(
         'value_bool', a.value_bool, 'value_number', a.value_number, 'value_text', a.value_text,
         'value_date', to_char(a.value_date, 'YYYY-MM-DD'), 'value_time', to_char(a.value_time, 'HH24:MI'), 'note', a.note, 'photo_id', a.photo_id,
         'is_exception', a.is_exception, 'exception_reason', a.exception_reason, 'received_at', a.received_at,
         'client_captured_at', a.client_captured_at, 'lat', a.lat, 'lng', a.lng, 'accuracy_m', a.accuracy_m,
         'answered_by', u.full_name) end as answer
     from run_items i left join answers a on a.run_item_id = i.id left join users u on u.id = a.user_id
     where i.run_id = $1 order by i.position`,
    [runId],
  );
  const today = todayLocal();
  const items: RunItem[] = rows.map((r) => ({
    ...r,
    complete: !!r.answer && evaluateAnswer(r, { ...r.answer, value_number: r.answer.value_number == null ? null : Number(r.answer.value_number) }, today).complete,
  }));
  const done = items.filter((i) => i.complete).length;
  const nextIndex = items.findIndex((i) => !i.complete);
  return { run, items, done, total: items.length, nextIndex: nextIndex === -1 ? null : nextIndex };
}

export const answerInput = z.object({
  value_bool: z.boolean().nullish(),
  value_number: z.number().finite().nullish(),
  value_text: z.string().max(2000).nullish(),
  value_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  value_time: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  note: z.string().max(2000).nullish(),
  photo_id: z.string().uuid().nullish(),
  geo: geoInput,
  client_time: z.string().datetime({ offset: true }).nullish(),
});

/**
 * Save one answer. Called at every step, so she can stop and carry on later
 * from exactly here. The time is the server's; the phone's own time is kept
 * alongside for answers that were captured with no signal and sent later.
 */
export async function saveAnswer(actor: Actor, runId: string, runItemId: string, input: z.input<typeof answerInput>) {
  const userId = actorUserId(actor);
  const a = answerInput.parse(input);
  const ctx = await one<{ run_id: string; status: string; store_id: string; org_id: string; template_id: string; store_name: string } & ItemRules & { tier: Tier | null }>(
    `select r.id as run_id, r.status, r.store_id, r.org_id, r.template_id, s.name as store_name,
       i.answer_type, i.label, i.unit, i.min_value, i.max_value, i.range_unconfirmed, i.photo_rule, i.date_mode, i.date_warn_days,
       to_char(i.latest_time, 'HH24:MI') as latest_time, i.tier
     from run_items i join checklist_runs r on r.id = i.run_id join stores s on s.id = r.store_id
     where i.id = $1 and r.id = $2`,
    [runItemId, runId],
  );
  if (!ctx) throw notFound("That task");
  const { role } = await requireStore(actor, ctx.store_id, "visit.checkin");
  if (ctx.status === "submitted") throw conflict("This checklist was submitted and cannot be changed.");
  const t = await one<{ roles: Role[] }>(`select roles from checklist_templates where id = $1`, [ctx.template_id]);
  if (!t?.roles.includes(role)) throw forbidden("This checklist is not one your role is asked to do.");
  await requireOpenVisitAt(actor, ctx.store_id);
  if (a.photo_id) {
    const p = await one(`select 1 from photos where id = $1 and store_id = $2`, [a.photo_id, ctx.store_id]);
    if (!p) throw badRequest("That photo belongs to a different store. Please take it again.");
  }
  // Keep only the value that belongs to this kind of task.
  const v = {
    value_bool: ctx.answer_type === "tick" ? a.value_bool ?? null : null,
    value_number: ctx.answer_type === "number" ? a.value_number ?? null : null,
    value_text: ctx.answer_type === "text" ? a.value_text?.trim() || null : null,
    value_date: ctx.answer_type === "date" ? a.value_date ?? null : null,
    value_time: ctx.answer_type === "time" ? a.value_time ?? null : null,
    note: a.note?.trim() || null,
    photo_id: a.photo_id ?? null,
  };
  const ev = evaluateAnswer(ctx, v, todayLocal());
  const prior = await one<{ is_exception: boolean }>(`select is_exception from answers where run_item_id = $1`, [runItemId]);
  await q(
    `insert into answers (run_id, run_item_id, user_id, value_bool, value_number, value_text, value_date, value_time, note, photo_id,
       is_exception, exception_reason, lat, lng, accuracy_m, client_captured_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (run_item_id) do update set user_id = excluded.user_id, value_bool = excluded.value_bool,
       value_number = excluded.value_number, value_text = excluded.value_text, value_date = excluded.value_date, value_time = excluded.value_time,
       note = excluded.note, photo_id = excluded.photo_id, is_exception = excluded.is_exception,
       exception_reason = excluded.exception_reason, lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
       client_captured_at = excluded.client_captured_at, updated_at = now()`,
    [runId, runItemId, userId, v.value_bool, v.value_number, v.value_text, v.value_date, v.value_time, v.note, v.photo_id,
      ev.isException, ev.reason, a.geo?.lat ?? null, a.geo?.lng ?? null, a.geo?.accuracy_m ?? null, a.client_time ?? null],
  );
  await recordEvent(actor, ctx.org_id, "checklist_answer.saved", "run_item", runItemId, {
    run_id: runId, is_exception: ev.isException, complete: ev.complete, value: v,
  });

  // Raise the alert once, the first time this task turns out wrong.
  let alerted = false;
  if (ev.isException && !prior?.is_exception) {
    const already = await one(`select 1 from alerts where source_type = 'run_item' and source_id = $1`, [runItemId]);
    if (!already) {
      const who = actor.kind === "user" ? actor.name : "Someone";
      await raiseAlert({
        orgId: ctx.org_id,
        storeId: ctx.store_id,
        tier: ctx.tier,
        kind: "checklist_exception",
        title: ctx.label,
        body: `${ev.reason}. Recorded by ${who}.${v.note ? ` Note: "${v.note}"` : ""}`,
        sourceType: "run_item",
        sourceId: runItemId,
        link: `/reports/runs/${runId}`,
        createdBy: userId,
      });
      alerted = true;
    }
  }
  return { complete: ev.complete, is_exception: ev.isException, reason: ev.reason, missing: ev.missing, alerted };
}

export async function submitRun(actor: Actor, runId: string) {
  const { run, items } = await getRun(actor, runId);
  if (run.status === "submitted") return { already: true };
  await requireOpenVisitAt(actor, run.store_id);
  const missing = items.filter((i) => !i.complete);
  if (missing.length) {
    throw badRequest(`${missing.length} task${missing.length === 1 ? " is" : "s are"} not finished yet: ${missing.slice(0, 3).map((m) => m.label).join(", ")}${missing.length > 3 ? " and more" : ""}.`, {
      missing: missing.map((m) => m.id),
    });
  }
  await q(`update checklist_runs set status = 'submitted', submitted_at = now() where id = $1`, [runId]);
  const exceptions = items.filter((i) => i.answer?.is_exception).length;
  await recordEvent(actor, run.org_id, "checklist_run.submitted", "checklist_run", runId, {
    store_id: run.store_id, template_id: run.template_id, items: items.length, exceptions,
  });
  return { already: false, items: items.length, exceptions };
}
