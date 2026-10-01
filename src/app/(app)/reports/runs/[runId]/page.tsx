import { notFound } from "next/navigation";
import { pageActor } from "@/lib/http";
import { getRun } from "@/lib/services/runs";
import { RunBlock, PrintButton } from "@/components/report-parts";
import { Page } from "@/components/ui";
import type { ReportRun } from "@/lib/services/reports";

export const metadata = { title: "Checklist record" };

export default async function RunRecord({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const actor = await pageActor();
  const d = await getRun(actor, runId).catch(() => null);
  if (!d) notFound();
  const run: ReportRun = {
    id: d.run.id, template_id: d.run.template_id, template_name: d.run.template_name, cadence: d.run.cadence, period_key: d.run.period_key,
    due_by: d.run.due_by, status: d.run.status, started_at: d.run.started_at, submitted_at: d.run.submitted_at, started_by: d.run.started_by, visit_id: d.run.visit_id,
    answers: d.items.map((i) => ({
      position: i.position, label: i.label, answer_type: i.answer_type, tier: i.tier, unit: i.unit,
      min_value: i.min_value == null ? null : String(i.min_value), max_value: i.max_value == null ? null : String(i.max_value), range_unconfirmed: i.range_unconfirmed,
      value_bool: i.answer?.value_bool ?? null, value_number: i.answer?.value_number ?? null, value_text: i.answer?.value_text ?? null,
      value_date: i.answer?.value_date ?? null, value_time: i.answer?.value_time ?? null, note: i.answer?.note ?? null, photo_id: i.answer?.photo_id ?? null,
      is_exception: i.answer?.is_exception ?? false, exception_reason: i.answer?.exception_reason ?? null,
      received_at: i.answer?.received_at ? String(i.answer.received_at) : null, client_captured_at: i.answer?.client_captured_at ? String(i.answer.client_captured_at) : null,
      lat: i.answer?.lat ?? null, lng: i.answer?.lng ?? null, accuracy_m: i.answer?.accuracy_m ?? null, answered_by: i.answer?.answered_by ?? null,
    })),
  };
  return (
    <Page title={d.run.store_name} back={{ href: "/alerts", label: "Alerts" }} actions={<PrintButton />}>
      <RunBlock run={run} />
    </Page>
  );
}
