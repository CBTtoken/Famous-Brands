import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan, visibleStores } from "@/lib/core/authz";
import { activeVisit, ipText, locationText } from "@/lib/services/visits";
import { dueChecklists } from "@/lib/services/runs";
import { cadenceLabel, formatTime } from "@/lib/core/time";
import { Badge, Card, Empty, Notice, Page } from "@/components/ui";
import { CheckInPicker } from "./check-in-picker";
import { VisitActions } from "./visit-actions";
import { OutboxStatus } from "@/components/outbox-status";

export const metadata = { title: "My shift" };

export default async function ShiftPage() {
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "visit.checkin")) {
    return <Page title="My shift"><Empty>Your role does not do shop visits.</Empty></Page>;
  }
  const visit = await activeVisit(actor);
  const first = actor.name.split(" ")[0];

  if (!visit) {
    const stores = (await visibleStores(actor, org.orgId)).filter((s) => s.active);
    return (
      <Page title={`Good day, ${first}`}>
        <OutboxStatus />
        {stores.length === 0 ? (
          <Empty>You are not assigned to any store yet. Ask your admin to add you to your store.</Empty>
        ) : (
          <Card title="Which store are you at?">
            <CheckInPicker stores={stores.map((s) => ({ id: s.id, name: s.name, brand: s.brand }))} />
          </Card>
        )}
      </Page>
    );
  }

  const due = await dueChecklists(actor, visit.id);
  const mismatch = visit.mismatch_reason != null;
  return (
    <Page title={visit.store_name}>
      <div className="flex flex-col gap-4">
        <OutboxStatus />
        <Notice kind={mismatch ? "warn" : "ok"}>
          Checked in at {formatTime(visit.started_at)}. {locationText[visit.start_location_check]}
          {visit.start_distance_m != null && visit.start_location_check === "outside" ? ` (${visit.start_distance_m} m away)` : ""}.{" "}
          {ipText[visit.start_ip_check]}.
          {mismatch && <> Your reason was sent to your manager.</>}
        </Notice>

        <Card title="Your checklists">
          {due.length === 0 ? (
            <Empty>No checklists are set for your role at this store.</Empty>
          ) : (
            <VisitActions
              checklists={due.map((d) => ({
                templateId: d.template_id,
                runId: d.run_id,
                name: d.name,
                hint:
                  d.run_status === "submitted"
                    ? `Done for this period`
                    : d.run_status === "in_progress"
                      ? `${d.answered} of ${d.items} answered. Carry on where you left off.`
                      : `${d.items} tasks. ${cadenceLabel[d.cadence]}${d.due_by ? `, by ${d.due_by}` : ""}.`,
                status: d.run_status,
              }))}
              visitId={visit.id}
            />
          )}
        </Card>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <Badge kind="brand">Server time</Badge> Every answer is stamped with the time on our server and where your phone was.
        </div>
      </div>
    </Page>
  );
}
