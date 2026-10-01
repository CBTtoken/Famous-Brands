import { setupContext } from "../guard";
import { listCatalogue, listSuppliers } from "@/lib/services/stock";
import { Card, Page } from "@/components/ui";
import { LibraryButton } from "../library-button";
import { CatalogueEditor } from "./catalogue-editor";

export const metadata = { title: "Items and suppliers" };

export default async function CataloguePage() {
  const { actor, org } = await setupContext();
  const [items, suppliers] = await Promise.all([listCatalogue(actor, org.orgId), listSuppliers(actor, org.orgId)]);
  return (
    <Page title="Items and suppliers" back={{ href: "/setup", label: "Setup" }}>
      <div className="grid gap-4">
        <Card title="Starter content">
          <p className="mb-3 text-sm text-muted">Physical items only, never food. The smalls list is the 85 lines of the Debonairs standard order form (October 2025), with Catercare Equipment prices excluding VAT.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <LibraryButton orgId={org.orgId} what="catalogue" label="Load the standard smalls list" />
            <LibraryButton orgId={org.orgId} what="suppliers" label="Add the researched suppliers" />
          </div>
        </Card>
        <CatalogueEditor orgId={org.orgId} items={JSON.parse(JSON.stringify(items))} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, notes: s.notes, items: s.items, contact_name: s.contact_name, phone: s.phone, email: s.email, website: s.website }))} />
      </div>
    </Page>
  );
}
