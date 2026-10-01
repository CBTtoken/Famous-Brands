import "server-only";
import { one, q } from "../db";
import type { Actor } from "../core/auth";
import type { Role } from "../core/authz";
import { badRequest, conflict, forbidden } from "../core/errors";
import { recordEvent } from "../core/events";
import { importResearchedSuppliers, importSmallsCatalogue, importStarterChecklists } from "./library";
import { createOrganisation, createPerson, saveStore, setAssignments } from "./org";
import { saveTemplate, setTemplateStatus } from "./templates";
import { applyStarterList } from "./stock";
import { setNotificationRules } from "./alerts";

// Dewald, 1 October 2026: the pilot shop and the Famous Brands sign-off
// contact are not known yet, so the POC is shown with demo accounts that are
// labelled as demo everywhere they appear. Everything here is built through
// the same services a real group uses, so the demo proves the real paths.
// No visits, answers, reports or figures are created: every number on S.O.S
// starts at nothing and comes only from what testers actually do.

export const DEMO_ORG_NAME = "DEMO shop group (not a real franchisee)";
export const DEMO_STORE_NAME = "DEMO shop (not a real store)";
/** .invalid is reserved and can never receive mail, so no demo login reaches a real inbox. */
const DEMO_EMAIL_DOMAIN = "demo.sos.invalid";

const DEMO_PEOPLE: { full_name: string; login: string; role: Role; can_order: boolean }[] = [
  { full_name: "DEMO Group Admin", login: "admin", role: "admin", can_order: true },
  { full_name: "DEMO Area Manager", login: "area.manager", role: "area_manager", can_order: false },
  { full_name: "DEMO Shop Manager", login: "shop.manager", role: "shop_manager", can_order: true },
  { full_name: "DEMO Supervisor", login: "supervisor", role: "supervisor", can_order: false },
];

/** One short checklist that covers every acceptance test: a photo, a tick, free text, and a critical item. */
const DEMO_CHECKLIST = {
  name: "DEMO: proof of concept test checklist",
  category: "Demo",
  cadence: "as_needed" as const,
  roles: ["supervisor", "shop_manager", "area_manager"] as Role[],
  store_ids: [] as string[],
  items: [
    {
      label: "Fire extinguisher is in its place, with the pin in",
      help_text: "Demo item. It is set to critical, so marking it not done sends an alert.",
      answer_type: "tick" as const, tier: "critical" as const, photo_rule: "on_exception" as const,
    },
    {
      label: "Take a photo of the front counter",
      help_text: "Demo item. The camera opens inside this task.",
      answer_type: "photo" as const, tier: "important" as const,
    },
    {
      label: "Wet floor sign is out where the floor is wet",
      answer_type: "tick" as const, tier: "urgent" as const,
    },
    {
      label: "Anything else the manager should know?",
      help_text: "Demo item. Type a short note.",
      answer_type: "text" as const,
    },
  ],
};

export function demoLogins() {
  return DEMO_PEOPLE.map((p) => ({ full_name: p.full_name, role: p.role, email: `${p.login}@${DEMO_EMAIL_DOMAIN}` }));
}

export async function demoGroup() {
  return one<{ id: string; name: string }>(`select id, name from organisations where is_demo order by created_at limit 1`);
}

/**
 * Creates the demo shop group once. Platform admin only. The password is the
 * one shared demo password, chosen by the platform admin and never stored
 * anywhere but as each account's hash.
 */
export async function createDemoGroup(actor: Actor, password: string) {
  if (actor.kind !== "user" || !actor.isPlatformAdmin) throw forbidden("Only a platform admin can set up the demo accounts.");
  if (password.length < 12) throw badRequest("Use a demo password of at least 12 characters. Every demo account shares it.");
  if (await demoGroup()) throw conflict("The demo shop group already exists. Choose it from the list to work in it.");

  const orgId = await createOrganisation(actor, DEMO_ORG_NAME);
  await q(`update organisations set is_demo = true where id = $1`, [orgId]);
  const storeId = await saveStore(actor, orgId, null, {
    name: DEMO_STORE_NAME,
    address: "Not a real address. Set a map pin under Setup, Stores to test the location check.",
  });

  for (const p of DEMO_PEOPLE) {
    const userId = await createPerson(actor, orgId, {
      full_name: p.full_name, email: `${p.login}@${DEMO_EMAIL_DOMAIN}`, role: p.role, password,
    });
    // Demo accounts are shared by testers, so a forced password change on
    // first sign-in would lock out everybody after the first person.
    await q(`update users set must_change_password = false where id = $1`, [userId]);
    await setAssignments(actor, orgId, userId, [{ store_id: storeId, can_order: p.can_order }]);
  }

  // The client's 46 tasks as drafts, exactly as a real group gets them.
  const starter = await importStarterChecklists(actor, orgId);
  const templateId = await saveTemplate(actor, orgId, null, DEMO_CHECKLIST);
  await setTemplateStatus(actor, templateId, "published");

  const catalogue = await importSmallsCatalogue(actor, orgId);
  await importResearchedSuppliers(actor, orgId);
  const items = await applyStarterList(actor, storeId, { suggestOrder: false });

  await setNotificationRules(actor, orgId, [
    { tier: "critical", recipient_role: "admin", push: true },
    { tier: "critical", recipient_role: "shop_manager", push: true },
    { tier: "urgent", recipient_role: "shop_manager", push: true },
    { tier: "important", recipient_role: "shop_manager", push: true },
  ]);

  await recordEvent(actor, orgId, "demo.created", "organisation", orgId, { store_id: storeId, people: DEMO_PEOPLE.length });
  return {
    orgId,
    storeId,
    logins: demoLogins(),
    checklists: { demo: DEMO_CHECKLIST.name, drafts: starter.added.length },
    items: items.added,
    catalogue: catalogue.added,
  };
}
