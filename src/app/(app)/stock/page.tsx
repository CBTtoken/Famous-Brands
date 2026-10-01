import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan, visibleStores } from "@/lib/core/authz";
import { listCatalogue, listReorders, listReports, listStoreItems, listSuppliers } from "@/lib/services/stock";
import { Empty, Page } from "@/components/ui";
import { StockView } from "./stock-view";
import Link from "next/link";

export const metadata = { title: "Stock and shop condition" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const sp = await searchParams;
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "stock.view")) return <Page title="Stock"><Empty>Your role does not see stock.</Empty></Page>;
  const stores = await visibleStores(actor, org.orgId);
  if (!stores.length) return <Page title="Stock"><Empty>No stores yet.</Empty></Page>;
  const store = stores.find((s) => s.id === sp.store) ?? stores[0];
  const [items, reports, reorders, catalogue, suppliers] = await Promise.all([
    listStoreItems(actor, store.id),
    listReports(actor, store.id, { open: true }),
    listReorders(actor, store.id, "open"),
    listCatalogue(actor, org.orgId),
    listSuppliers(actor, org.orgId),
  ]);
  return (
    <Page title="Stock and shop condition">
      {stores.length > 1 && (
        <div className="no-print mb-4 flex flex-wrap gap-2">
          {stores.map((s) => (
            <Link key={s.id} href={`/stock?store=${s.id}`} className={`rounded-full border px-3 py-1.5 text-sm ${s.id === store.id ? "border-brand bg-brand text-white" : "border-line bg-surface"}`}>{s.name}</Link>
          ))}
        </div>
      )}
      <StockView
        store={{ id: store.id, name: store.name }}
        canManage={roleCan(org.role, "stock.manage")}
        canOrder={reorders.canOrder}
        data={JSON.parse(JSON.stringify({ items, reports, reorders: reorders.rows, catalogue: catalogue.filter((c) => c.active), suppliers }))}
      />
    </Page>
  );
}
