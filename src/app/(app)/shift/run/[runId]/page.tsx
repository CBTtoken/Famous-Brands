import { redirect } from "next/navigation";
import { pageActor } from "@/lib/http";
import { getRun } from "@/lib/services/runs";
import { activeVisit } from "@/lib/services/visits";
import { RunPlayer } from "./run-player";

export const metadata = { title: "Checklist" };

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const actor = await pageActor();
  const data = await getRun(actor, runId);
  if (data.run.status === "submitted") redirect(`/reports/runs/${runId}`);
  const visit = await activeVisit(actor);
  if (!visit || visit.store_id !== data.run.store_id) redirect("/shift");
  return (
    <RunPlayer
      run={{ id: data.run.id, name: data.run.template_name, storeId: data.run.store_id, storeName: data.run.store_name }}
      items={JSON.parse(JSON.stringify(data.items))}
      startIndex={data.nextIndex}
    />
  );
}
