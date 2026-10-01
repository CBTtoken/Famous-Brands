import Link from "next/link";
import { setupContext } from "./guard";
import { one } from "@/lib/db";
import { Card, Page } from "@/components/ui";

export const metadata = { title: "Setup" };

export default async function SetupHome() {
  const { org } = await setupContext();
  const c = await one<{ stores: number; people: number; checklists: number; published: number; items: number; rules: number; keys: number }>(
    `select (select count(*)::int from stores where org_id = $1) as stores,
       (select count(*)::int from memberships where org_id = $1) as people,
       (select count(*)::int from checklist_templates where org_id = $1) as checklists,
       (select count(*)::int from checklist_templates where org_id = $1 and status = 'published') as published,
       (select count(*)::int from catalogue_items where org_id = $1) as items,
       (select count(*)::int from notification_rules where org_id = $1) as rules,
       (select count(*)::int from api_keys where org_id = $1 and revoked_at is null) as keys`,
    [org.orgId],
  );
  const tiles = [
    { href: "/setup/stores", title: "1. Stores", text: `${c!.stores} store${c!.stores === 1 ? "" : "s"}. Location, internet address, check-in rule.` },
    { href: "/setup/people", title: "2. People", text: `${c!.people} ${c!.people === 1 ? "person" : "people"}. Roles, which stores they cover, ordering authority.` },
    { href: "/setup/checklists", title: "3. Checklists", text: `${c!.checklists} checklists, ${c!.published} in use. Tasks, answer types, tiers.` },
    { href: "/setup/alerts", title: "4. Who gets alerts", text: `${c!.rules} rule${c!.rules === 1 ? "" : "s"}. Which tier goes to whom, by push.` },
    { href: "/setup/catalogue", title: "5. Items and suppliers", text: `${c!.items} items in the catalogue. Prices, suppliers, starter list.` },
    { href: "/setup/integrations", title: "6. Other systems", text: `${c!.keys} active key${c!.keys === 1 ? "" : "s"}. For Munch, Aura, OPUS or reporting tools.` },
  ];
  return (
    <Page title={`Setup: ${org.orgName}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="h-full hover:border-brand"><h2 className="font-semibold">{t.title}</h2><p className="text-sm text-muted">{t.text}</p></Card>
          </Link>
        ))}
      </div>
    </Page>
  );
}
