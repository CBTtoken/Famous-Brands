import { setupContext } from "../guard";
import { listApiKeys } from "@/lib/services/integration";
import { config } from "@/lib/config";
import { Card, Page } from "@/components/ui";
import { KeysEditor } from "./keys-editor";

export const metadata = { title: "Other systems" };

export default async function IntegrationsPage() {
  const { actor, org } = await setupContext();
  const keys = await listApiKeys(actor, org.orgId);
  return (
    <Page title="Other systems" back={{ href: "/setup", label: "Setup" }}>
      <div className="grid gap-4">
        <Card title="How other systems connect">
          <p className="text-sm">Everything this app does can also be done through its API, so Munch, Aura, OPUS or a reporting tool can be linked later without rebuilding anything. No live link to those systems exists yet.</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            <li>Send the key as <code>Authorization: Bearer sos_...</code>.</li>
            <li>A key acts with the role you give it, in this group only, and can be revoked at any time.</li>
            <li>The event feed lists everything that happened, in order: <code>GET {config.appUrl}/api/v1/organisations/{org.orgId}/events?after=0</code></li>
            <li>The full list of endpoints is in <code>docs/API.md</code> in the code.</li>
          </ul>
        </Card>
        <KeysEditor orgId={org.orgId} keys={JSON.parse(JSON.stringify(keys))} />
      </div>
    </Page>
  );
}
