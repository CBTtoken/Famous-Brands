import { setupContext } from "../guard";
import { getNotificationRules } from "@/lib/services/alerts";
import { getOrganisation, listPeople } from "@/lib/services/org";
import { Page } from "@/components/ui";
import { RulesEditor } from "./rules-editor";

export const metadata = { title: "Who gets alerts" };

export default async function AlertRulesPage() {
  const { actor, org } = await setupContext();
  const [rules, people, o] = await Promise.all([getNotificationRules(actor, org.orgId), listPeople(actor, org.orgId), getOrganisation(actor, org.orgId)]);
  return (
    <Page title="Who gets alerts" back={{ href: "/setup", label: "Setup" }}>
      <RulesEditor orgId={org.orgId} rules={rules} people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.full_name }))}
        tiers={{ checkin_mismatch_tier: o!.checkin_mismatch_tier, stock_broken_tier: o!.stock_broken_tier, stock_stolen_tier: o!.stock_stolen_tier, stock_worn_tier: o!.stock_worn_tier }} />
    </Page>
  );
}
