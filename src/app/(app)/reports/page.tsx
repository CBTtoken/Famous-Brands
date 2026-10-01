import Link from "next/link";
import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan, visibleStores } from "@/lib/core/authz";
import { Card, Empty, Page } from "@/components/ui";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "reports.view")) return <Page title="Reports"><Empty>Your role does not see reports.</Empty></Page>;
  const stores = await visibleStores(actor, org.orgId);
  return (
    <Page title="Reports">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="One shop in detail">
          <p className="mb-3 text-sm text-muted">Who did what, when and where, with every photo and note. Print it or download it for Excel.</p>
          {stores.length === 0 ? <Empty>No stores yet.</Empty> : (
            <ol className="flex flex-col gap-1">
              {stores.map((s, i) => (
                <li key={s.id}><Link className="flex gap-2 rounded px-2 py-2 hover:bg-brand-light" href={`/reports/store/${s.id}`}><span className="text-muted">{i + 1}.</span> {s.name}</Link></li>
              ))}
            </ol>
          )}
        </Card>
        <Card title="Report to Famous Brands">
          <p className="mb-3 text-sm text-muted">Every shop on one page, for the franchisor. The same figures as the S.O.S screen.</p>
          <Link className="text-brand underline" href="/reports/franchisor">Open the summary report</Link>
        </Card>
      </div>
    </Page>
  );
}
