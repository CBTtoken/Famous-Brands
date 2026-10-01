import { notFound } from "next/navigation";
import { pageActor } from "@/lib/http";
import { one } from "@/lib/db";
import { requireStore } from "@/lib/core/authz";
import { VisitsTable } from "@/components/report-parts";
import { Card, Page } from "@/components/ui";
import type { ReportVisit } from "@/lib/services/reports";

export const metadata = { title: "Visit" };

export default async function VisitRecord({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const actor = await pageActor();
  const v = await one<ReportVisit & { store_id: string; store_name: string }>(
    `select v.*, u.full_name as person, s.name as store_name from visits v join users u on u.id = v.user_id join stores s on s.id = v.store_id where v.id = $1`,
    [visitId],
  ).catch(() => null);
  if (!v) notFound();
  await requireStore(actor, v.store_id, "reports.view");
  return (
    <Page title={`Visit to ${v.store_name}`} back={{ href: "/alerts", label: "Alerts" }}>
      <Card><VisitsTable visits={[v]} /></Card>
    </Page>
  );
}
