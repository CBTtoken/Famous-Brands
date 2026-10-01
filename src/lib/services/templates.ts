import "server-only";
import { z } from "zod";
import { one, q, tx } from "../db";
import type { Actor } from "../core/auth";
import { requireOrg, roleIn, type Role } from "../core/authz";
import { badRequest, notFound } from "../core/errors";
import { recordEvent } from "../core/events";
import type { Cadence } from "../core/time";
import type { Tier } from "../core/tiers";

export const templateItemInput = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(2, "Every task needs a name"),
    help_text: z.string().trim().max(500).nullish(),
    answer_type: z.enum(["tick", "number", "photo", "date", "time", "text"]),
    tier: z.enum(["critical", "urgent", "important", "be_aware"]).nullish(),
    unit: z.string().trim().max(20).nullish(),
    min_value: z.number().nullish(),
    max_value: z.number().nullish(),
    range_unconfirmed: z.boolean().default(false),
    photo_rule: z.enum(["never", "always", "on_exception"]).default("never"),
    date_mode: z.enum(["expiry", "max_age"]).default("expiry"),
    date_warn_days: z.number().int().min(0).max(3650).nullish(),
    latest_time: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 09:00").nullish(),
  })
  .refine((i) => i.min_value == null || i.max_value == null || i.min_value <= i.max_value, {
    message: "The minimum cannot be higher than the maximum",
  });

export const templateInput = z.object({
  name: z.string().trim().min(2, "Give the checklist a name"),
  category: z.string().trim().min(1).max(60).default("General"),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly", "six_monthly", "as_needed"]),
  due_by: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 09:00").nullish(),
  roles: z.array(z.enum(["admin", "area_manager", "shop_manager", "supervisor"])).min(1, "Choose at least one role to do it"),
  store_ids: z.array(z.string().uuid()).default([]),
  items: z.array(templateItemInput).min(1, "Add at least one task"),
});
export type TemplateInput = z.input<typeof templateInput>;

export type TemplateRow = {
  id: string; org_id: string; name: string; category: string; cadence: Cadence; due_by: string | null;
  roles: Role[]; status: "draft" | "published" | "retired"; updated_at: Date;
};
export type TemplateItemRow = {
  id: string; position: number; label: string; help_text: string | null; answer_type: "tick" | "number" | "photo" | "date" | "time" | "text";
  tier: Tier | null; unit: string | null; min_value: string | null; max_value: string | null; range_unconfirmed: boolean;
  photo_rule: "never" | "always" | "on_exception"; date_mode: "expiry" | "max_age"; date_warn_days: number | null;
  latest_time: string | null; retired: boolean;
};

export async function listTemplates(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  return q<TemplateRow & { items: number; stores: number; runs: number }>(
    `select t.id, t.org_id, t.name, t.category, t.cadence, to_char(t.due_by, 'HH24:MI') as due_by, t.roles, t.status, t.updated_at,
       (select count(*)::int from template_items i where i.template_id = t.id and not i.retired) as items,
       (select count(*)::int from template_stores ts where ts.template_id = t.id) as stores,
       (select count(*)::int from checklist_runs r where r.template_id = t.id) as runs
     from checklist_templates t where t.org_id = $1
     order by case t.status when 'published' then 0 when 'draft' then 1 else 2 end, t.category, t.name`,
    [orgId],
  );
}

export async function getTemplate(actor: Actor, templateId: string) {
  const t = await one<TemplateRow>(
    `select id, org_id, name, category, cadence, to_char(due_by, 'HH24:MI') as due_by, roles, status, updated_at
     from checklist_templates where id = $1`,
    [templateId],
  );
  if (!t || !roleIn(actor, t.org_id)) throw notFound("That checklist");
  requireOrg(actor, t.org_id, "org.manage");
  const items = await q<TemplateItemRow>(
    `select id, position, label, help_text, answer_type, tier, unit, min_value, max_value, range_unconfirmed, photo_rule, date_mode, date_warn_days, to_char(latest_time, 'HH24:MI') as latest_time, retired
     from template_items where template_id = $1 order by retired, position`,
    [templateId],
  );
  const stores = await q<{ store_id: string }>(`select store_id from template_stores where template_id = $1`, [templateId]);
  return { ...t, items, store_ids: stores.map((s) => s.store_id) };
}

/**
 * Create or save a checklist. Items sent with an id are updated in place,
 * items without one are added, and items left out are retired, never
 * deleted, because past checklists point at them. Runs already started keep
 * their own frozen copy, so a change never rewrites an old record.
 */
export async function saveTemplate(actor: Actor, orgId: string, templateId: string | null, input: TemplateInput) {
  requireOrg(actor, orgId, "org.manage");
  const t = templateInput.parse(input);
  if (t.store_ids.length) {
    const ok = await q(`select id from stores where org_id = $1 and id = any($2::uuid[])`, [orgId, t.store_ids]);
    if (ok.length !== new Set(t.store_ids).size) throw notFound("One of those stores");
  }
  return tx(async (c) => {
    let id = templateId;
    if (id) {
      const r = await one(
        `update checklist_templates set name=$3, category=$4, cadence=$5, due_by=$6, roles=$7, updated_at=now()
         where id=$1 and org_id=$2 returning id`,
        [id, orgId, t.name, t.category, t.cadence, t.due_by ?? null, t.roles],
        c,
      );
      if (!r) throw notFound("That checklist");
    } else {
      const r = await one<{ id: string }>(
        `insert into checklist_templates (org_id, name, category, cadence, due_by, roles, created_by)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [orgId, t.name, t.category, t.cadence, t.due_by ?? null, t.roles, actor.kind === "user" ? actor.userId : null],
        c,
      );
      id = r!.id;
    }
    const existing = await q<{ id: string }>(`select id from template_items where template_id = $1`, [id], c);
    const existingIds = new Set(existing.map((e) => e.id));
    const kept = new Set<string>();
    for (const [i, item] of t.items.entries()) {
      const vals = [
        item.label, item.help_text ?? null, item.answer_type, item.tier ?? null, item.unit ?? null,
        item.answer_type === "number" ? item.min_value ?? null : null,
        item.answer_type === "number" ? item.max_value ?? null : null,
        item.answer_type === "number" ? item.range_unconfirmed : false,
        item.answer_type === "photo" ? "never" : item.photo_rule,
        item.answer_type === "date" ? item.date_mode : "expiry",
        item.answer_type === "date" ? item.date_warn_days ?? null : null,
        item.answer_type === "time" ? item.latest_time ?? null : null,
        i + 1,
      ];
      if (item.id && existingIds.has(item.id)) {
        kept.add(item.id);
        await q(
          `update template_items set label=$2, help_text=$3, answer_type=$4, tier=$5, unit=$6, min_value=$7, max_value=$8,
             range_unconfirmed=$9, photo_rule=$10, date_mode=$11, date_warn_days=$12, latest_time=$13, position=$14, retired=false where id=$1`,
          [item.id, ...vals],
          c,
        );
      } else {
        await q(
          `insert into template_items (template_id, label, help_text, answer_type, tier, unit, min_value, max_value,
             range_unconfirmed, photo_rule, date_mode, date_warn_days, latest_time, position)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [id, ...vals],
          c,
        );
      }
    }
    const retire = [...existingIds].filter((x) => !kept.has(x));
    if (retire.length) await q(`update template_items set retired = true where id = any($1::uuid[])`, [retire], c);
    await q(`delete from template_stores where template_id = $1`, [id], c);
    for (const s of t.store_ids) await q(`insert into template_stores (template_id, store_id) values ($1,$2)`, [id, s], c);
    await recordEvent(actor, orgId, templateId ? "checklist.updated" : "checklist.created", "checklist_template", id, {
      name: t.name, items: t.items.length, retired_items: retire.length,
    }, c);
    return id!;
  });
}

export async function setTemplateStatus(actor: Actor, templateId: string, status: "draft" | "published" | "retired") {
  const t = await one<{ org_id: string }>(`select org_id from checklist_templates where id = $1`, [templateId]);
  if (!t) throw notFound("That checklist");
  requireOrg(actor, t.org_id, "org.manage");
  if (status === "published") {
    const n = await one<{ n: number }>(`select count(*)::int as n from template_items where template_id = $1 and not retired`, [templateId]);
    if (!n?.n) throw badRequest("Add at least one task before publishing.");
  }
  await q(
    `update checklist_templates set status = $2, updated_at = now(),
       published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end,
       retired_at = case when $2 = 'retired' then now() when $2 = 'published' then null else retired_at end
     where id = $1`,
    [templateId, status],
  );
  await recordEvent(actor, t.org_id, `checklist.${status}`, "checklist_template", templateId);
}
