import { redirect } from "next/navigation";
import { pageActor } from "@/lib/http";
import { activeVisit } from "@/lib/services/visits";
import { listStoreItems } from "@/lib/services/stock";
import { Empty, Page } from "@/components/ui";
import { ReportItem } from "./report-item";

export const metadata = { title: "Report an item" };

export default async function ReportItemPage() {
  const actor = await pageActor();
  const visit = await activeVisit(actor);
  if (!visit) redirect("/shift");
  const items = await listStoreItems(actor, visit.store_id);
  return (
    <Page title="Report a broken or missing item" back={{ href: "/shift", label: "My shift" }}>
      {items.length === 0 ? (
        <Empty>This shop has no item list yet. Ask your manager to set it up.</Empty>
      ) : (
        <ReportItem storeId={visit.store_id} items={items.map((i) => ({ id: i.id, name: i.name, area: i.area, par: i.par_qty, code: i.code }))} />
      )}
    </Page>
  );
}
