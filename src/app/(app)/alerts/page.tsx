import Link from "next/link";
import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan } from "@/lib/core/authz";
import { listAlerts } from "@/lib/services/alerts";
import { formatDateTime } from "@/lib/core/time";
import { tierLabel } from "@/lib/core/tiers";
import { Badge, Empty, Page } from "@/components/ui";
import { AckButton } from "./ack-button";

export const metadata = { title: "Alerts" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const sp = await searchParams;
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "alerts.view")) return <Page title="Alerts"><Empty>Your role does not see alerts.</Empty></Page>;
  const alerts = await listAlerts(actor, org.orgId, { open: sp.all !== "1" });
  return (
    <Page title="Alerts" actions={<Link className="text-sm text-brand underline" href={sp.all === "1" ? "/alerts" : "/alerts?all=1"}>{sp.all === "1" ? "Show only open alerts" : "Show dealt-with alerts too"}</Link>}>
      {alerts.length === 0 ? <Empty>{sp.all === "1" ? "No alerts yet." : "Nothing needs your attention."}</Empty> : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.id} className={`rounded-xl border bg-surface p-4 ${a.acknowledged_at ? "border-line opacity-75" : a.tier === "critical" || a.tier === "urgent" ? "border-bad" : "border-line"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {a.tier ? <Badge kind={a.tier === "critical" || a.tier === "urgent" ? "bad" : "warn"}>{tierLabel[a.tier]}</Badge> : <Badge>No tier</Badge>}
                  <span className="font-semibold">{a.title}</span>
                </div>
                <span className="text-xs text-muted">{formatDateTime(a.created_at)}</span>
              </div>
              <p className="mt-1 text-sm">{a.store_name ? <strong>{a.store_name}. </strong> : null}{a.body}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  Push: {a.sent} delivered{a.no_device ? `, ${a.no_device} with no phone set up` : ""}{a.failed ? `, ${a.failed} failed` : ""}{a.queued ? `, ${a.queued} sending` : ""}.
                  {a.acknowledged_at && ` Dealt with by ${a.acknowledged_by_name} ${formatDateTime(a.acknowledged_at)}.`}
                </span>
                <span className="flex gap-3">
                  {a.link && <Link className="text-brand underline" href={a.link}>Open the record</Link>}
                  {!a.acknowledged_at && roleCan(org.role, "alerts.acknowledge") && <AckButton id={a.id} />}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
