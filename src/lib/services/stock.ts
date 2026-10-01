import "server-only";
import { z } from "zod";
import { one, q, tx } from "../db";
import type { Actor } from "../core/auth";
import { actorUserId, requireOrg, requireStore } from "../core/authz";
import { badRequest, conflict, forbidden, notFound } from "../core/errors";
import { recordEvent } from "../core/events";
import type { Tier } from "../core/tiers";
import { raiseAlert } from "./alerts";
import { activeVisit, geoInput } from "./visits";

export type Condition = "fine" | "broken" | "stolen" | "worn";
export const conditionLabel: Record<Condition, string> = {
  fine: "Fine",
  broken: "Broken",
  stolen: "Stolen or missing",
  worn: "Worn out",
};

// ---- suppliers ----------------------------------------------------------------

export const supplierInput = z.object({
  name: z.string().trim().min(2, "Give the supplier a name"),
  contact_name: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email("That email address does not look right").nullish().or(z.literal("").transform(() => null)),
  website: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export async function listSuppliers(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "stock.view");
  return q<{ id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; website: string | null; notes: string | null; items: number }>(
    `select s.*, (select count(*)::int from catalogue_items c where c.default_supplier_id = s.id) as items
     from suppliers s where s.org_id = $1 order by s.name`,
    [orgId],
  );
}

export async function saveSupplier(actor: Actor, orgId: string, id: string | null, input: z.input<typeof supplierInput>) {
  requireOrg(actor, orgId, "org.manage");
  const s = supplierInput.parse(input);
  try {
    if (id) {
      const r = await one(`update suppliers set name=$3, contact_name=$4, phone=$5, email=$6, website=$7, notes=$8 where id=$1 and org_id=$2 returning id`,
        [id, orgId, s.name, s.contact_name ?? null, s.phone ?? null, s.email ?? null, s.website ?? null, s.notes ?? null]);
      if (!r) throw notFound("That supplier");
    } else {
      const r = await one<{ id: string }>(`insert into suppliers (org_id, name, contact_name, phone, email, website, notes) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [orgId, s.name, s.contact_name ?? null, s.phone ?? null, s.email ?? null, s.website ?? null, s.notes ?? null]);
      id = r!.id;
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw conflict("There is already a supplier with that name.");
    throw e;
  }
  await recordEvent(actor, orgId, "supplier.saved", "supplier", id, s);
  return id;
}

// ---- catalogue -----------------------------------------------------------------

export const catalogueInput = z.object({
  code: z.string().trim().max(60).nullish(),
  name: z.string().trim().min(2, "Give the item a name"),
  category: z.string().trim().min(1).max(60).default("General"),
  unit_price_cents: z.number().int().min(0).nullish(),
  price_source: z.string().trim().max(200).nullish(),
  default_supplier_id: z.string().uuid().nullish(),
  franchise_locked: z.enum(["yes", "no", "unknown"]).default("unknown"),
  standard_qty: z.number().int().min(0).nullish(),
  service_interval_days: z.number().int().min(1).max(3650).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  active: z.boolean().default(true),
});

export type CatalogueRow = z.infer<typeof catalogueInput> & { id: string; supplier_name: string | null };

export async function listCatalogue(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "stock.view");
  return q<CatalogueRow>(
    `select c.*, s.name as supplier_name from catalogue_items c left join suppliers s on s.id = c.default_supplier_id
     where c.org_id = $1 order by c.active desc, c.category, c.name`,
    [orgId],
  );
}

export async function saveCatalogueItem(actor: Actor, orgId: string, id: string | null, input: z.input<typeof catalogueInput>) {
  requireOrg(actor, orgId, "org.manage");
  const c = catalogueInput.parse(input);
  if (c.default_supplier_id) {
    const s = await one(`select 1 from suppliers where id = $1 and org_id = $2`, [c.default_supplier_id, orgId]);
    if (!s) throw notFound("That supplier");
  }
  const vals = [c.code ?? null, c.name, c.category, c.unit_price_cents ?? null, c.price_source ?? null, c.default_supplier_id ?? null,
    c.franchise_locked, c.standard_qty ?? null, c.service_interval_days ?? null, c.notes ?? null, c.active];
  if (id) {
    const r = await one(
      `update catalogue_items set code=$3, name=$4, category=$5, unit_price_cents=$6, price_source=$7, default_supplier_id=$8,
         franchise_locked=$9, standard_qty=$10, service_interval_days=$11, notes=$12, active=$13 where id=$1 and org_id=$2 returning id`,
      [id, orgId, ...vals],
    );
    if (!r) throw notFound("That item");
  } else {
    const r = await one<{ id: string }>(
      `insert into catalogue_items (org_id, code, name, category, unit_price_cents, price_source, default_supplier_id, franchise_locked,
         standard_qty, service_interval_days, notes, active) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [orgId, ...vals],
    );
    id = r!.id;
  }
  await recordEvent(actor, orgId, "catalogue_item.saved", "catalogue_item", id, c);
  return id;
}

// ---- a shop's items ---------------------------------------------------------------

export type StoreItemRow = {
  id: string; catalogue_item_id: string; code: string | null; name: string; category: string; area: string; par_qty: number;
  supplier_id: string | null; supplier_name: string | null; unit_price_cents: number | null; franchise_locked: string;
  next_service_date: string | null; broken: number; stolen: number; worn: number; open_reports: number;
  last_checked_at: Date | null; open_orders: number;
};

export async function listStoreItems(actor: Actor, storeId: string) {
  await requireStore(actor, storeId, "stock.view");
  return q<StoreItemRow>(
    `select si.id, si.catalogue_item_id, c.code, c.name, c.category, si.area, si.par_qty,
       coalesce(si.supplier_id, c.default_supplier_id) as supplier_id, sup.name as supplier_name, c.unit_price_cents, c.franchise_locked,
       to_char(si.next_service_date, 'YYYY-MM-DD') as next_service_date,
       coalesce(sum(r.qty) filter (where r.condition = 'broken' and r.resolved_at is null), 0)::int as broken,
       coalesce(sum(r.qty) filter (where r.condition = 'stolen' and r.resolved_at is null), 0)::int as stolen,
       coalesce(sum(r.qty) filter (where r.condition = 'worn' and r.resolved_at is null), 0)::int as worn,
       count(r.*) filter (where r.condition <> 'fine' and r.resolved_at is null)::int as open_reports,
       max(r.created_at) as last_checked_at,
       (select count(*)::int from reorder_suggestions o where o.store_item_id = si.id and o.status = 'open') as open_orders
     from store_items si join catalogue_items c on c.id = si.catalogue_item_id
     left join suppliers sup on sup.id = coalesce(si.supplier_id, c.default_supplier_id)
     left join condition_reports r on r.store_item_id = si.id
     where si.store_id = $1
     group by si.id, c.id, sup.name order by si.area, c.category, c.name`,
    [storeId],
  );
}

export const storeItemInput = z.object({
  catalogue_item_id: z.string().uuid(),
  area: z.enum(["front", "kitchen", "back", "outside"]).default("kitchen"),
  par_qty: z.number().int().min(0).max(10000),
  supplier_id: z.string().uuid().nullish(),
  next_service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export async function saveStoreItem(actor: Actor, storeId: string, input: z.input<typeof storeItemInput>) {
  const { store } = await requireStore(actor, storeId, "stock.manage");
  const s = storeItemInput.parse(input);
  const c = await one(`select 1 from catalogue_items where id = $1 and org_id = $2`, [s.catalogue_item_id, store.org_id]);
  if (!c) throw notFound("That catalogue item");
  if (s.supplier_id) {
    const sup = await one(`select 1 from suppliers where id = $1 and org_id = $2`, [s.supplier_id, store.org_id]);
    if (!sup) throw notFound("That supplier");
  }
  const r = await one<{ id: string }>(
    `insert into store_items (store_id, catalogue_item_id, area, par_qty, supplier_id, next_service_date) values ($1,$2,$3,$4,$5,$6)
     on conflict (store_id, catalogue_item_id) do update set area = excluded.area, par_qty = excluded.par_qty,
       supplier_id = excluded.supplier_id, next_service_date = excluded.next_service_date
     returning id`,
    [storeId, s.catalogue_item_id, s.area, s.par_qty, s.supplier_id ?? null, s.next_service_date ?? null],
  );
  await recordEvent(actor, store.org_id, "store_item.saved", "store_item", r!.id, { store_id: storeId, ...s });
  return r!.id;
}

/**
 * Give a shop the standard starter list: every active catalogue item with a
 * standard quantity. For a brand-new shop this also raises a reorder
 * suggestion for the full quantity, which is the shop's opening order.
 * Reports exactly what it added and what it skipped.
 */
export async function applyStarterList(actor: Actor, storeId: string, opts: { suggestOrder: boolean }) {
  const { store } = await requireStore(actor, storeId, "stock.manage");
  return tx(async (c) => {
    const items = await q<{ id: string; name: string; standard_qty: number; default_supplier_id: string | null; unit_price_cents: number | null; area: string }>(
      `select id, name, standard_qty, default_supplier_id, unit_price_cents,
         case when category ilike '%clean%' or category ilike '%hygiene%' then 'back' else 'kitchen' end as area
       from catalogue_items where org_id = $1 and active and coalesce(standard_qty, 0) > 0`,
      [store.org_id],
      c,
    );
    let added = 0, skipped = 0, suggested = 0;
    for (const it of items) {
      const r = await one<{ id: string }>(
        `insert into store_items (store_id, catalogue_item_id, area, par_qty) values ($1,$2,$3,$4)
         on conflict (store_id, catalogue_item_id) do nothing returning id`,
        [storeId, it.id, it.area, it.standard_qty],
        c,
      );
      if (!r) { skipped++; continue; }
      added++;
      if (opts.suggestOrder) {
        await q(
          `insert into reorder_suggestions (org_id, store_id, store_item_id, supplier_id, qty, unit_price_cents, reason, created_by)
           values ($1,$2,$3,$4,$5,$6,'starter',$7)`,
          [store.org_id, storeId, r.id, it.default_supplier_id, it.standard_qty, it.unit_price_cents, actor.kind === "user" ? actor.userId : null],
          c,
        );
        suggested++;
      }
    }
    await recordEvent(actor, store.org_id, "store.starter_list_applied", "store", storeId, { added, skipped, suggested }, c);
    return { added, skipped, suggested, catalogueItems: items.length };
  });
}

// ---- condition reports -------------------------------------------------------------

export const conditionInput = z.object({
  store_item_id: z.string().uuid(),
  condition: z.enum(["fine", "broken", "stolen", "worn"]),
  qty: z.number().int().min(0).max(10000).default(1),
  note: z.string().trim().max(2000).nullish(),
  photo_id: z.string().uuid().nullish(),
  walk_id: z.string().uuid().nullish(),
  geo: geoInput,
  client_time: z.string().datetime({ offset: true }).nullish(),
});

/**
 * Record an item's condition. Broken, stolen or worn raises a reorder
 * suggestion with the supplier the store owner chose for that item, and an
 * alert at whatever tier admin set for that condition.
 */
export async function reportCondition(actor: Actor, input: z.input<typeof conditionInput>) {
  const userId = actorUserId(actor);
  const c = conditionInput.parse(input);
  const item = await one<{ store_id: string; name: string; supplier_id: string | null; unit_price_cents: number | null; par_qty: number }>(
    `select si.store_id, ci.name, coalesce(si.supplier_id, ci.default_supplier_id) as supplier_id, ci.unit_price_cents, si.par_qty
     from store_items si join catalogue_items ci on ci.id = si.catalogue_item_id where si.id = $1`,
    [c.store_item_id],
  );
  if (!item) throw notFound("That item");
  const { store } = await requireStore(actor, item.store_id, "stock.report");
  const visit = await activeVisit(actor);
  if (!visit || visit.store_id !== store.id) throw badRequest("Check in at this store first.");
  if (c.condition !== "fine" && c.qty < 1) throw badRequest("Say how many are affected.");
  if (c.condition !== "fine" && !c.photo_id && c.condition !== "stolen") throw badRequest("Take a photo of the item.");
  if (c.photo_id) {
    const p = await one(`select 1 from photos where id = $1 and store_id = $2`, [c.photo_id, store.id]);
    if (!p) throw badRequest("That photo belongs to a different store. Please take it again.");
  }
  if (c.walk_id) {
    const w = await one<{ submitted_at: Date | null; store_id: string }>(`select submitted_at, store_id from condition_walks where id = $1`, [c.walk_id]);
    if (!w || w.store_id !== store.id) throw notFound("That shop walk");
    if (w.submitted_at) throw conflict("This shop walk is finished and cannot be changed.");
    const prior = await one(`select 1 from condition_reports where walk_id = $1 and store_item_id = $2`, [c.walk_id, c.store_item_id]);
    if (prior) throw conflict("This item is already recorded on this walk.");
  }
  const result = await tx(async (cx) => {
    const r = await one<{ id: string }>(
      `insert into condition_reports (org_id, store_id, store_item_id, walk_id, visit_id, condition, qty, note, photo_id, lat, lng, accuracy_m,
         client_captured_at, reported_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [store.org_id, store.id, c.store_item_id, c.walk_id ?? null, visit.id, c.condition, c.condition === "fine" ? 0 : c.qty,
        c.note ?? null, c.photo_id ?? null, c.geo?.lat ?? null, c.geo?.lng ?? null, c.geo?.accuracy_m ?? null, c.client_time ?? null, userId],
      cx,
    );
    let suggestionId: string | null = null;
    if (c.condition !== "fine") {
      const s = await one<{ id: string }>(
        `insert into reorder_suggestions (org_id, store_id, store_item_id, supplier_id, qty, unit_price_cents, reason, source_report_id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [store.org_id, store.id, c.store_item_id, item.supplier_id, c.qty, item.unit_price_cents, c.condition, r!.id, userId],
        cx,
      );
      suggestionId = s!.id;
    }
    await recordEvent(actor, store.org_id, "item_condition.reported", "condition_report", r!.id, {
      store_id: store.id, store_item_id: c.store_item_id, condition: c.condition, qty: c.qty, reorder_suggestion_id: suggestionId,
    }, cx);
    return { report_id: r!.id, reorder_suggestion_id: suggestionId };
  });
  if (c.condition !== "fine") {
    const org = await one<Record<string, Tier | null>>(`select stock_broken_tier, stock_stolen_tier, stock_worn_tier from organisations where id = $1`, [store.org_id]);
    const tier = org?.[`stock_${c.condition}_tier`] ?? null;
    await raiseAlert({
      orgId: store.org_id,
      storeId: store.id,
      tier,
      kind: `stock_${c.condition}`,
      title: `${item.name}: ${conditionLabel[c.condition].toLowerCase()}`,
      body: `${c.qty} reported ${conditionLabel[c.condition].toLowerCase()} by ${actor.kind === "user" ? actor.name : "someone"}.${c.note ? ` Note: "${c.note}"` : ""}`,
      sourceType: "condition_report",
      sourceId: result.report_id,
      link: `/stock?store=${store.id}`,
      createdBy: userId,
    });
  }
  return result;
}

export async function resolveReport(actor: Actor, reportId: string, note: string | null) {
  const r = await one<{ store_id: string; org_id: string; resolved_at: Date | null; condition: Condition }>(
    `select store_id, org_id, resolved_at, condition from condition_reports where id = $1`,
    [reportId],
  );
  if (!r) throw notFound("That report");
  await requireStore(actor, r.store_id, "stock.manage");
  if (r.condition === "fine") throw badRequest("Nothing to resolve on an item marked fine.");
  if (r.resolved_at) throw conflict("This was already marked as dealt with.");
  await q(`update condition_reports set resolved_at = now(), resolved_by = $2, resolution_note = $3 where id = $1`, [reportId, actorUserId(actor), note?.trim() || null]);
  await recordEvent(actor, r.org_id, "item_condition.resolved", "condition_report", reportId, { note });
}

export async function listReports(actor: Actor, storeId: string, opts: { open?: boolean; from?: Date; to?: Date } = {}) {
  await requireStore(actor, storeId, "stock.view");
  return q<{ id: string; item_name: string; code: string | null; area: string; condition: Condition; qty: number; note: string | null; photo_id: string | null;
    reported_by: string; created_at: Date; resolved_at: Date | null; resolved_by: string | null; resolution_note: string | null;
    lat: number | null; lng: number | null; accuracy_m: number | null; walk_id: string | null }>(
    `select r.id, c.name as item_name, c.code, si.area, r.condition, r.qty, r.note, r.photo_id, u.full_name as reported_by, r.created_at,
       r.resolved_at, ru.full_name as resolved_by, r.resolution_note, r.lat, r.lng, r.accuracy_m, r.walk_id
     from condition_reports r join store_items si on si.id = r.store_item_id join catalogue_items c on c.id = si.catalogue_item_id
     join users u on u.id = r.reported_by left join users ru on ru.id = r.resolved_by
     where r.store_id = $1 and ($2::boolean is not true or (r.resolved_at is null and r.condition <> 'fine'))
       and ($3::timestamptz is null or r.created_at >= $3) and ($4::timestamptz is null or r.created_at < $4)
     order by r.created_at desc limit 500`,
    [storeId, opts.open ?? false, opts.from ?? null, opts.to ?? null],
  );
}

// ---- shop walks ----------------------------------------------------------------------

export async function startWalk(actor: Actor) {
  const userId = actorUserId(actor);
  const v = await activeVisit(actor);
  if (!v) throw badRequest("Check in at the store first.");
  await requireStore(actor, v.store_id, "stock.report");
  const open = await one<{ id: string }>(
    `select id from condition_walks where store_id = $1 and user_id = $2 and submitted_at is null order by started_at desc limit 1`,
    [v.store_id, userId],
  );
  if (open) return { walk_id: open.id, resumed: true };
  const n = await one<{ n: number }>(`select count(*)::int as n from store_items where store_id = $1`, [v.store_id]);
  if (!n?.n) throw badRequest("This shop has no item list yet. Ask your manager to set it up.");
  const w = await one<{ id: string }>(`insert into condition_walks (org_id, store_id, visit_id, user_id) values ($1,$2,$3,$4) returning id`, [v.org_id, v.store_id, v.id, userId]);
  await recordEvent(actor, v.org_id, "shop_walk.started", "condition_walk", w!.id, { store_id: v.store_id });
  return { walk_id: w!.id, resumed: false };
}

export async function getWalk(actor: Actor, walkId: string) {
  const w = await one<{ id: string; store_id: string; store_name: string; user_id: string; started_at: Date; submitted_at: Date | null; walked_by: string }>(
    `select w.id, w.store_id, s.name as store_name, w.user_id, w.started_at, w.submitted_at, u.full_name as walked_by
     from condition_walks w join stores s on s.id = w.store_id join users u on u.id = w.user_id where w.id = $1`,
    [walkId],
  );
  if (!w) throw notFound("That shop walk");
  const { role } = await requireStore(actor, w.store_id, "stock.view");
  if (role === "supervisor" && actor.kind === "user" && w.user_id !== actor.userId) throw notFound("That shop walk");
  const items = await q<{ store_item_id: string; name: string; code: string | null; area: string; category: string; par_qty: number;
    report: null | { condition: Condition; qty: number; note: string | null; photo_id: string | null; created_at: string } }>(
    `select si.id as store_item_id, c.name, c.code, si.area, c.category, si.par_qty,
       case when r.id is null then null else json_build_object('condition', r.condition, 'qty', r.qty, 'note', r.note,
         'photo_id', r.photo_id, 'created_at', r.created_at) end as report
     from store_items si join catalogue_items c on c.id = si.catalogue_item_id
     left join condition_reports r on r.store_item_id = si.id and r.walk_id = $2
     where si.store_id = $1 order by case si.area when 'front' then 0 when 'kitchen' then 1 when 'back' then 2 else 3 end, c.category, c.name`,
    [w.store_id, walkId],
  );
  const done = items.filter((i) => i.report).length;
  const next = items.findIndex((i) => !i.report);
  return { walk: w, items, done, total: items.length, nextIndex: next === -1 ? null : next };
}

export async function submitWalk(actor: Actor, walkId: string) {
  const { walk, done, total } = await getWalk(actor, walkId);
  if (actor.kind !== "user" || walk.user_id !== actor.userId) throw forbidden("Only the person walking the shop can finish it.");
  if (walk.submitted_at) return { already: true };
  if (done < total) throw badRequest(`${total - done} item${total - done === 1 ? " is" : "s are"} not checked yet.`);
  await q(`update condition_walks set submitted_at = now() where id = $1`, [walkId]);
  const org = await one<{ org_id: string }>(`select org_id from condition_walks where id = $1`, [walkId]);
  await recordEvent(actor, org!.org_id, "shop_walk.submitted", "condition_walk", walkId, { items: total });
  return { already: false };
}

// ---- reorder suggestions ---------------------------------------------------------------

export async function listReorders(actor: Actor, storeId: string, status: "open" | "ordered" | "dismissed" | "all" = "open") {
  const { canOrder } = await requireStore(actor, storeId, "stock.view");
  const rows = await q<{ id: string; item_name: string; code: string | null; qty: number; unit_price_cents: number | null; reason: string;
    supplier_id: string | null; supplier_name: string | null; status: string; created_at: Date; created_by: string | null; decided_by: string | null;
    decided_at: Date | null; decision_note: string | null; franchise_locked: string }>(
    `select o.id, c.name as item_name, c.code, o.qty, o.unit_price_cents, o.reason, o.supplier_id, s.name as supplier_name, o.status,
       o.created_at, cu.full_name as created_by, du.full_name as decided_by, o.decided_at, o.decision_note, c.franchise_locked
     from reorder_suggestions o join store_items si on si.id = o.store_item_id join catalogue_items c on c.id = si.catalogue_item_id
     left join suppliers s on s.id = o.supplier_id left join users cu on cu.id = o.created_by left join users du on du.id = o.decided_by
     where o.store_id = $1 and ($2 = 'all' or o.status = $2)
     order by o.status = 'open' desc, s.name nulls last, c.name`,
    [storeId, status],
  );
  return { rows, canOrder };
}

/**
 * Mark a suggestion ordered or dismissed. Only someone with ordering
 * authority for this store may do this. Placing the order with the supplier
 * itself is outside this system for now.
 */
export async function decideReorder(actor: Actor, id: string, decision: "ordered" | "dismissed", note: string | null) {
  const o = await one<{ store_id: string; org_id: string; status: string }>(`select store_id, org_id, status from reorder_suggestions where id = $1`, [id]);
  if (!o) throw notFound("That reorder");
  const { canOrder } = await requireStore(actor, o.store_id, "stock.view");
  if (!canOrder) throw forbidden("You do not have ordering authority for this store.");
  if (o.status !== "open") throw conflict("This reorder was already decided.");
  await q(`update reorder_suggestions set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1`,
    [id, decision, actor.kind === "user" ? actor.userId : null, note?.trim() || null]);
  await recordEvent(actor, o.org_id, `reorder.${decision}`, "reorder_suggestion", id, { note });
}
