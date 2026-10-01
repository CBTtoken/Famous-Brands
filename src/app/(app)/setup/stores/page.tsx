import { setupContext } from "../guard";
import { listStores } from "@/lib/services/org";
import { requestIp } from "@/lib/http";
import { Page } from "@/components/ui";
import { StoresEditor } from "./stores-editor";

export const metadata = { title: "Stores" };

export default async function StoresPage() {
  const { actor, org } = await setupContext();
  const stores = await listStores(actor, org.orgId);
  return (
    <Page title="Stores" back={{ href: "/setup", label: "Setup" }}>
      <StoresEditor orgId={org.orgId} stores={JSON.parse(JSON.stringify(stores))} myIp={await requestIp()} />
    </Page>
  );
}
