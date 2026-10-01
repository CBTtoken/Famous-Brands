import { answerText, type ReportAnswer, type ReportRun, type ReportVisit } from "@/lib/services/reports";
import { formatDateTime, formatTime, cadenceLabel } from "@/lib/core/time";
import { tierLabel } from "@/lib/core/tiers";
import { ipText, locationText } from "@/lib/services/visits";
import { Badge } from "./ui";
import { PrintButton } from "./print-button";

export function MapLink({ lat, lng, acc }: { lat: number | null; lng: number | null; acc?: number | null }) {
  if (lat == null || lng == null) return <span className="text-muted">No location</span>;
  return (
    <a className="text-brand underline" href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer">
      {lat.toFixed(5)}, {lng.toFixed(5)}{acc != null ? ` (±${Math.round(acc)} m)` : ""}
    </a>
  );
}

function rule(a: ReportAnswer) {
  if (a.answer_type !== "number") return null;
  if (a.range_unconfirmed) return "range not confirmed";
  const min = a.min_value == null ? null : Number(a.min_value), max = a.max_value == null ? null : Number(a.max_value);
  if (min != null && max != null) return `${min} to ${max}`;
  if (min != null) return `min ${min}`;
  if (max != null) return `max ${max}`;
  return null;
}

export function RunBlock({ run }: { run: ReportRun }) {
  const problems = run.answers.filter((a) => a.is_exception).length;
  const answered = run.answers.filter((a) => a.received_at).length;
  return (
    <section className="print-break rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{run.template_name}</h3>
          <p className="text-sm text-muted">
            {cadenceLabel[run.cadence]}, period {run.period_key}. Started {formatDateTime(run.started_at)} by {run.started_by}.{" "}
            {run.submitted_at ? `Sent ${formatDateTime(run.submitted_at)}.` : "Not sent yet."}
          </p>
        </div>
        <div className="flex gap-1">
          {run.status === "submitted" ? <Badge kind="ok">Sent</Badge> : <Badge kind="warn">{answered} of {run.answers.length} answered</Badge>}
          {problems > 0 && <Badge kind="bad">{problems} problem{problems === 1 ? "" : "s"}</Badge>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-1 pr-2">#</th><th className="pr-2">Task</th><th className="pr-2">Answer</th><th className="pr-2">Evidence</th><th className="pr-2">When and where</th>
            </tr>
          </thead>
          <tbody>
            {run.answers.map((a) => (
              <tr key={a.position} className={`border-b border-line align-top ${a.is_exception ? "bg-bad-light" : ""}`}>
                <td className="py-2 pr-2 text-muted">{a.position}</td>
                <td className="pr-2">
                  {a.label}
                  {a.tier && <span className="ml-1"><Badge kind={a.tier === "critical" || a.tier === "urgent" ? "bad" : "warn"}>{tierLabel[a.tier]}</Badge></span>}
                  {rule(a) && <div className="text-xs text-muted">Allowed: {rule(a)}</div>}
                </td>
                <td className="pr-2">
                  {a.received_at ? <span className="font-medium">{answerText(a)}</span> : <span className="text-muted">Not answered</span>}
                  {a.is_exception && <div className="text-xs font-medium text-bad">{a.exception_reason}</div>}
                  {a.note && <div className="text-xs">Note: {a.note}</div>}
                </td>
                <td className="pr-2">
                  {a.photo_id ? (
                    <a href={`/api/v1/photos/${a.photo_id}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/v1/photos/${a.photo_id}`} alt={`Photo: ${a.label}`} loading="lazy" className="h-20 w-20 rounded border border-line object-cover" />
                    </a>
                  ) : <span className="text-muted">None</span>}
                </td>
                <td className="pr-2 text-xs">
                  {a.received_at && <div>{formatTime(a.received_at)} by {a.answered_by}</div>}
                  {a.client_captured_at && Math.abs(Date.parse(a.client_captured_at) - Date.parse(a.received_at ?? a.client_captured_at)) > 120000 && (
                    <div className="text-warn">Captured offline at {formatTime(a.client_captured_at)}</div>
                  )}
                  {a.received_at && <MapLink lat={a.lat} lng={a.lng} acc={a.accuracy_m} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function VisitsTable({ visits }: { visits: ReportVisit[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-line"><th className="py-1 pr-2">Who</th><th className="pr-2">Checked in</th><th className="pr-2">Checked out</th><th className="pr-2">At the store?</th><th>Reason given</th></tr>
        </thead>
        <tbody>
          {visits.map((v) => (
            <tr key={v.id} className={`border-b border-line align-top ${v.mismatch_reason ? "bg-warn-light" : ""}`}>
              <td className="py-2 pr-2">{v.person}</td>
              <td className="pr-2">{formatDateTime(v.started_at)}<div className="text-xs"><MapLink lat={v.start_lat} lng={v.start_lng} acc={v.start_accuracy_m} /></div></td>
              <td className="pr-2">{v.ended_at ? formatDateTime(v.ended_at) : "Still checked in"}{v.end_location_check === "not_checked_out" && <div className="text-xs text-warn">Did not check out</div>}</td>
              <td className="pr-2 text-xs">
                {locationText[v.start_location_check as keyof typeof locationText] ?? v.start_location_check}{v.start_distance_m != null ? ` (${v.start_distance_m} m)` : ""}
                <br />{ipText[v.start_ip_check as keyof typeof ipText] ?? v.start_ip_check}
              </td>
              <td className="text-xs">{v.mismatch_reason ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { PrintButton };
