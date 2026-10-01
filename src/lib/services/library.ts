import "server-only";
import { one, q, tx } from "../db";
import type { Actor } from "../core/auth";
import { requireOrg } from "../core/authz";
import { recordEvent } from "../core/events";
import catalogue from "../library/smalls-catalogue.json";
import { starterChecklists } from "../library/starter-checklists";
import { saveTemplate } from "./templates";

/**
 * Load the client's 46 tasks as draft checklists. Drafts on purpose: an
 * admin reviews them, sets tiers and confirms ranges before publishing.
 * Skips any checklist with the same name that already exists, and says so.
 */
export async function importStarterChecklists(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  const added: string[] = [];
  const skipped: string[] = [];
  for (const s of starterChecklists) {
    const exists = await one(`select 1 from checklist_templates where org_id = $1 and name = $2`, [orgId, s.template.name]);
    if (exists) { skipped.push(s.template.name); continue; }
    await saveTemplate(actor, orgId, null, { ...s.template, store_ids: [] });
    added.push(s.template.name);
  }
  return { added, skipped };
}

/**
 * Load the standard smalls list (from the October 2025 order form) into the
 * organisation's catalogue, with the supplier on that form as the default.
 * Items whose name already exists are left alone and counted as skipped.
 */
export async function importSmallsCatalogue(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  return tx(async (c) => {
    let supplier = await one<{ id: string }>(`select id from suppliers where org_id = $1 and name = $2`, [orgId, catalogue.supplier], c);
    let supplierAdded = false;
    if (!supplier) {
      supplier = await one<{ id: string }>(
        `insert into suppliers (org_id, name, notes) values ($1,$2,$3) returning id`,
        [orgId, catalogue.supplier, "Supplier on the Debonairs smalls standard list order form, October 2025."],
        c,
      );
      supplierAdded = true;
    }
    let added = 0, skipped = 0;
    for (const it of catalogue.items) {
      const exists = await one(`select 1 from catalogue_items where org_id = $1 and name = $2`, [orgId, it.name], c);
      if (exists) { skipped++; continue; }
      await q(
        `insert into catalogue_items (org_id, code, name, category, unit_price_cents, price_source, default_supplier_id, standard_qty, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [orgId, it.code, it.name, it.category, it.unit_price_cents, it.price_source, supplier!.id, it.standard_qty, it.notes],
        c,
      );
      added++;
    }
    await recordEvent(actor, orgId, "catalogue.imported", "organisation", orgId, { added, skipped, source: catalogue.source }, c);
    return { added, skipped, total: catalogue.items.length, supplierAdded, source: catalogue.source };
  });
}

/** The suppliers researched in Supplier-Findings-v1, added as suppliers the owner can assign. */
const researchedSuppliers = [
  { name: "Amrod", notes: "Uniforms and branded apparel. Trade-only, vets applicants. Backups: Grand Uniforms, The Promo Group." },
  { name: "Jonsson Workwear", notes: "Chef jackets and kitchen uniforms. Corporate Sales division." },
  { name: "Dromex", notes: "PPE, gloves, wet floor signage. Sells mostly through distributors: Fowkes Bros, Trust Health & Safety, Toolcraft, BMG." },
  { name: "BBF Safety Group", notes: "Non-slip safety footwear (Bova, Lemaitre, Bronx). Distributor option: Treadsafe." },
  { name: "BCE Foodservice Equipment", notes: "Kitchen smallwares, utensils and cutlery. Dealer application via bce.co.za. Roodepoort." },
  { name: "Mpact Plastic Containers", notes: "Dough trays, bins and crates. Get the 600x400 dough tray quote first. Bulky: confirm courier sizing." },
  { name: "Bidvest Steiner", notes: "Hygiene and janitorial, HACCP colour-coded ranges. 39 branches." },
];

export async function importResearchedSuppliers(actor: Actor, orgId: string) {
  requireOrg(actor, orgId, "org.manage");
  let added = 0, skipped = 0;
  for (const s of researchedSuppliers) {
    const r = await one(
      `insert into suppliers (org_id, name, notes) values ($1,$2,$3) on conflict (org_id, name) do nothing returning id`,
      [orgId, s.name, `${s.notes} Source: Supplier-Findings-v1. Account not opened yet.`],
    );
    if (r) added++; else skipped++;
  }
  await recordEvent(actor, orgId, "suppliers.imported", "organisation", orgId, { added, skipped });
  return { added, skipped };
}
