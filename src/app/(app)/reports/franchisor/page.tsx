import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan } from "@/lib/core/authz";
import { parseRange, sos } from "@/lib/services/reports";
import { formatDate, formatDateTime } from "@/lib/core/time";
import { money } from "@/lib/client-format";
import { Badge, Card, Empty, Page } from "@/components/ui";
import { QualityRatio } from "@/components/quality-ratio";
import { RangePicker } from "@/components/range-picker";
import { PrintButton } from "@/components/report-parts";

export const metadata = { title: "Report to Famous Brands" };

export default async function FranchisorReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "reports.view")) return <Page title="Report"><Empty>Your role does not see reports.</Empty></Page>;
  const range = parseRange(sp.from, sp.to);
  const d = await sos(actor, org.orgId, range);
  const t = d.stores.reduce((a, s) => ({ expected: a.expected + s.expected, submitted: a.submitted + s.submitted, exceptions: a.exceptions + s.exceptions, visits: a.visits + s.visits, unconfirmed: a.unconfirmed + s.visits_unconfirmed, issues: a.issues + s.items_open_issues }), { expected: 0, submitted: 0, exceptions: 0, visits: 0, unconfirmed: 0, issues: 0 });
  return (
    <Page title="Shop Operational Status report" back={{ href: "/sos", label: "S.O.S" }} actions={<PrintButton />}>
      <p className="-mt-2 mb-3 text-sm text-muted">{org.orgName}. {formatDate(range.from)} to {formatDate(range.to)}. Prepared {formatDateTime(new Date())} by {actor.name}.</p>
      <RangePicker base="/reports/franchisor" from={range.from} to={range.to} />
      <div className="grid gap-4">
        <Card title="Across all shops">
          <p>
            {d.stores.length} shop{d.stores.length === 1 ? "" : "s"}. {t.submitted} of {t.expected} checklists due were done
            {t.expected ? ` (${Math.round((t.submitted / t.expected) * 1000) / 10}%)` : ""}. {t.exceptions} problem{t.exceptions === 1 ? "" : "s"} recorded.
            {" "}{t.visits} visit{t.visits === 1 ? "" : "s"}, {t.unconfirmed} not confirmed at the store. {t.issues} item{t.issues === 1 ? "" : "s"} currently broken, stolen or worn.
          </p>
        </Card>
        <Card title="Quality Ratio" aside={<Badge>Formula to be confirmed</Badge>}>
          <QualityRatio qr={d.quality_ratio} />
        </Card>
        <Card title="Shop by shop">
          {d.stores.length === 0 ? <Empty>No shops.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line"><th className="py-1 pr-2">Shop</th><th className="pr-2">Checklists done</th><th className="pr-2">On time</th><th className="pr-2">Missed</th><th className="pr-2">Problems</th><th className="pr-2">Pass rate</th><th className="pr-2">Visits (unconfirmed)</th><th className="pr-2">Items fine</th><th>To order</th></tr>
                </thead>
                <tbody>
                  {d.stores.map((s) => (
                    <tr key={s.store_id} className="border-b border-line">
                      <td className="py-2 pr-2 font-medium">{s.store_name}</td>
                      <td className="pr-2">{s.completion_pct == null ? "No data" : `${s.completion_pct}% (${s.submitted}/${s.expected})`}</td>
                      <td className="pr-2">{s.on_time_pct == null ? "" : `${s.on_time_pct}%`}</td>
                      <td className="pr-2">{s.missed}</td>
                      <td className="pr-2">{s.exceptions}</td>
                      <td className="pr-2">{s.checklist_pass_pct == null ? "No data" : `${s.checklist_pass_pct}%`}</td>
                      <td className="pr-2">{s.visits} ({s.visits_unconfirmed})</td>
                      <td className="pr-2">{s.items ? `${s.items - s.items_open_issues} of ${s.items} (${s.stock_condition_pct}%)` : "No list"}</td>
                      <td>{s.open_reorders ? `${s.open_reorders}, ${money(s.open_reorder_value_cents)}` : "0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="text-xs text-muted">How these are counted: a checklist is due once per period it applies to, from when it was set up. Today counts only once its due time has passed. Problems are answers outside their allowed range, tasks marked not done, or dates too close or too old. Prices exclude VAT.</p>
      </div>
    </Page>
  );
}
