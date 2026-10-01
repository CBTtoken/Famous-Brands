import { pageActor } from "@/lib/http";
import { q } from "@/lib/db";
import { Card, Empty, Page } from "@/components/ui";
import { PlatformTools } from "./platform-tools";
import { DemoSetup } from "./demo-setup";
import { demoGroup, demoLogins } from "@/lib/services/demo";

export const metadata = { title: "Shop groups" };

export default async function PlatformPage() {
  const actor = await pageActor();
  if (!actor.isPlatformAdmin) return <Page title="Shop groups"><Empty>This screen is for platform admins.</Empty></Page>;
  const orgs = await q<{ id: string; name: string; stores: number; people: number }>(
    `select o.id, o.name, (select count(*)::int from stores s where s.org_id = o.id) as stores,
       (select count(*)::int from memberships m where m.org_id = o.id) as people from organisations o order by o.name`);
  const demo = await demoGroup();
  return (
    <Page title="Shop groups">
      <Card>
        <p className="mb-3 text-sm text-muted">Each group is one franchisee and their stores. Nobody in one group can see another group. Choose a group to work in it.</p>
        <PlatformTools orgs={orgs} />
      </Card>
      <div className="mt-4">
        <Card title="Demo accounts">
          <DemoSetup existing={demo} logins={demoLogins()} />
        </Card>
      </div>
    </Page>
  );
}
