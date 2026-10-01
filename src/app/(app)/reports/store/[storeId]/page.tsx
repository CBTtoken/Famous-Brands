import { pageActor } from "@/lib/http";
import { checklistReport, parseRange } from "@/lib/services/reports";
import { formatDate, formatDateTime } from "@/lib/core/time";
import { q } from "@/lib/db";
import { ButtonLink, Card, Empty, Page, Stat } from "@/components/ui";
import { RangePicker } from "@/components/range-picker";
import { PrintButton, RunBlock, VisitsTable } from "@/components/report-parts";

export const metadata = { title: "Shop report" };

const conditionText: Record<string, string> = { broken: "Broken", stolen: "Stolen or missing", worn: "Worn out" };

export default async function StoreReport({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ from?: string; to?: string; checklist?: string }> }) {
  const { storeId } = await params;
  const sp = await searchParams;
  const actor = await pageActor();
  const range = parseRange(sp.from, sp.to);
  const r = await checklistReport(actor, storeId, range, sp.checklist || null);
  const templates = await q<{ id: string; name: string }>(
    `select distinct template_id as id, template_name as name from checklist_runs where store_id = $1 order by 2`, [storeId]);
  const problems = r.runs.reduce((n, run) => n + run.answers.filter((a) => a.is_exception).length, 0);
  const photos = r.runs.reduce((n, run) => n + run.answers.filter((a) => a.photo_id).length, 0);
  const csv = `/api/v1/stores/${storeId}/report?format=csv&from=${range.from}&to=${range.to}${sp.checklist ? `&checklist=${sp.checklist}` : ""}`;

  return (
    <Page
      title={`${r.store.name}: shop report`}
      back={{ href: "/reports", label: "Reports" }}
      actions={<><PrintButton /><ButtonLink variant="secondary" href={csv}>Download for Excel</ButtonLink></>}
    >
      <p className="-mt-2 mb-3 text-sm text-muted">
        {formatDate(range.from)} to {formatDate(range.to)}{r.store.brand ? `. ${r.store.brand}` : ""}. Prepared {formatDateTime(new Date())} by {actor.name}.
        Times are server times, South African time.
      </p>
      <RangePicker base={`/reports/store/${storeId}`} from={range.from} to={range.to} extra={{ checklist: sp.checklist }} />
      {templates.length > 1 && (
        <form className="no-print mb-4 flex items-end gap-2 text-sm" action={`/reports/store/${storeId}`}>
          <input type="hidden" name="from" value={range.from} /><input type="hidden" name="to" value={range.to} />
          <label className="flex flex-col">Checklist
            <select name="checklist" defaultValue={sp.checklist ?? ""} className="rounded border border-line px-2 py-1">
              <option value="">All checklists</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button className="rounded border border-line bg-surface px-3 py-1">Show</button>
        </form>
      )}

      <div className="grid gap-4">
        <Card title="In short">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Visits" value={r.visits.length} hint={`${r.visits.filter((v) => v.mismatch_reason).length} not confirmed at the store`} />
            <Stat label="Checklists" value={r.runs.length} hint={`${r.runs.filter((x) => x.status === "submitted").length} sent`} />
            <Stat label="Problems recorded" value={problems} kind={problems ? "warn" : undefined} />
            <Stat label="Photos" value={photos} />
            <Stat label="Items reported" value={r.stock.length} kind={r.stock.length ? "warn" : undefined} />
          </div>
        </Card>

        <Card title="Visits">{r.visits.length ? <VisitsTable visits={r.visits} /> : <Empty>No visits in this period.</Empty>}</Card>

        <h2 className="mt-2 text-xl font-semibold">Checklists</h2>
        {r.runs.length ? r.runs.map((run) => <RunBlock key={run.id} run={run} />) : <Empty>No checklists in this period.</Empty>}

        <Card title="Items reported broken, stolen or worn">
          {r.stock.length === 0 ? <Empty>None in this period.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="py-1 pr-2">Item</th><th className="pr-2">Condition</th><th className="pr-2">Reported</th><th className="pr-2">Photo</th><th>Dealt with</th></tr></thead>
                <tbody>
                  {r.stock.map((s) => (
                    <tr key={s.id} className="border-b border-line align-top">
                      <td className="py-2 pr-2">{s.item_name}{s.note && <div className="text-xs">Note: {s.note}</div>}</td>
                      <td className="pr-2">{s.qty} {conditionText[s.condition] ?? s.condition}</td>
                      <td className="pr-2 text-xs">{formatDateTime(s.created_at)} by {s.reported_by}</td>
                      <td className="pr-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {s.photo_id ? <img src={`/api/v1/photos/${s.photo_id}`} alt={s.item_name} loading="lazy" className="h-16 w-16 rounded border border-line object-cover" /> : <span className="text-muted">None</span>}
                      </td>
                      <td className="text-xs">{s.resolved_at ? formatDateTime(s.resolved_at) : "Not yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
