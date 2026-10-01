import Link from "next/link";
import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan } from "@/lib/core/authz";
import { parseRange, sos, type StorePerformance } from "@/lib/services/reports";
import { formatDate } from "@/lib/core/time";
import { tierLabel, type Tier } from "@/lib/core/tiers";
import { money } from "@/lib/client-format";
import { Badge, ButtonLink, Card, Empty, Notice, Page, Stat } from "@/components/ui";
import { RangePicker } from "@/components/range-picker";

export const metadata = { title: "S.O.S" };

function pct(v: number | null) {
  return v == null ? "No data" : `${v}%`;
}

function WeeklyBars({ weeks }: { weeks: StorePerformance["weekly"] }) {
  if (weeks.length < 2) return null;
  return (
    <figure className="mt-3">
      <figcaption className="mb-1 text-xs text-muted">Daily checklists done, per week</figcaption>
      <div className="flex h-20 items-end gap-0.5 border-b border-line" role="img" aria-label="Weekly completion">
        {weeks.map((w) => {
          const p = w.expected ? w.submitted / w.expected : 0;
          return (
            <div key={w.week} className="group relative flex h-full flex-1 items-end" title={`${w.week}: ${w.submitted} of ${w.expected} done`}>
              <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(p * 100, 2)}%` }} />
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                {w.week}: {w.submitted}/{w.expected}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted"><span>{weeks[0].week}</span><span>{weeks.at(-1)!.week}</span></div>
    </figure>
  );
}

function StoreCard({ s, from, to }: { s: StorePerformance; from: string; to: string }) {
  const tierRows = (Object.entries(s.exceptions_by_tier) as [Tier | "none", number][]).sort();
  return (
    <Card
      title={<Link href={`/reports/store/${s.store_id}?from=${from}&to=${to}`} className="hover:underline">{s.store_name}</Link>}
      aside={s.brand ? <Badge>{s.brand}</Badge> : undefined}
    >
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Performance</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Checklists done" value={pct(s.completion_pct)} hint={`${s.submitted} of ${s.expected} due`} kind={s.completion_pct == null ? undefined : s.completion_pct >= 90 ? "ok" : s.completion_pct >= 70 ? "warn" : "bad"} />
        <Stat label="Done on time" value={pct(s.on_time_pct)} hint={`${s.on_time} on time`} />
        <Stat label="Missed" value={s.missed} kind={s.missed ? "bad" : undefined} hint={s.in_progress ? `${s.in_progress} in progress now` : undefined} />
        <Stat label="Problems recorded" value={s.exceptions} kind={s.exceptions ? "warn" : undefined}
          hint={tierRows.length ? tierRows.map(([t, n]) => `${n} ${t === "none" ? "untiered" : tierLabel[t].toLowerCase()}`).join(", ") : undefined} />
        <Stat label="Visits" value={s.visits} hint={s.visits_unconfirmed ? `${s.visits_unconfirmed} not confirmed at the store` : "All confirmed at the store"} kind={s.visits_unconfirmed ? "warn" : undefined} />
      </div>
      <WeeklyBars weeks={s.weekly} />
      {s.repeat_offences.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-medium">Repeat problems (3 periods or more)</h4>
          <ul className="list-disc pl-5 text-sm">
            {s.repeat_offences.map((r) => <li key={r.label + r.template_name}>{r.label} <span className="text-muted">({r.template_name}, {r.periods} times)</span></li>)}
          </ul>
        </div>
      )}
      <h3 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-muted">Shop condition</h3>
      {s.items === 0 ? (
        <p className="text-sm text-muted">No item list set up for this shop yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Items with a problem" value={s.items_open_issues} hint={`of ${s.items} on the list`} kind={s.items_open_issues ? "warn" : "ok"} />
          <Stat label="Broken / stolen / worn" value={`${s.broken} / ${s.stolen} / ${s.worn}`} />
          <Stat label="Service overdue" value={s.service_overdue} kind={s.service_overdue ? "bad" : undefined} />
          <Stat label="Waiting to be ordered" value={s.open_reorders} hint={s.open_reorder_value_cents ? money(s.open_reorder_value_cents) + " excl. VAT" : undefined} />
        </div>
      )}
    </Card>
  );
}

export default async function SosPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "reports.view")) return <Page title="S.O.S"><Empty>Your role does not see S.O.S.</Empty></Page>;
  const range = parseRange(sp.from, sp.to);
  const data = await sos(actor, org.orgId, range);

  return (
    <Page
      title="Shop Operational Status"
      actions={<ButtonLink href={`/reports/franchisor?from=${range.from}&to=${range.to}`}>Report to Famous Brands</ButtonLink>}
    >
      <p className="-mt-2 mb-3 text-sm text-muted">{org.orgName}. {formatDate(range.from)} to {formatDate(range.to)}. Every figure is counted from records, nothing is estimated.</p>
      <RangePicker base="/sos" from={range.from} to={range.to} />
      <div className="grid gap-4">
        <Card title="Quality Ratio">
          <Notice kind="info">
            Waiting on the formula. The Quality Ratio will combine the figures below into one score, but the weighting has to be agreed
            with Dewald first, so no score is shown until then. Nothing here is invented.
          </Notice>
          <p className="mt-2 text-sm text-muted">Figures ready to feed it: checklists done, done on time, problems by tier, unconfirmed check-ins, and items broken, stolen, worn or overdue for service.</p>
        </Card>
        {data.stores.length === 0 ? <Empty>No stores to show. Add a store under Setup.</Empty> : data.stores.map((s) => <StoreCard key={s.store_id} s={s} from={range.from} to={range.to} />)}
      </div>
    </Page>
  );
}
