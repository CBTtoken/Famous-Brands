import { pageActor } from "@/lib/http";
import { config } from "@/lib/config";
import { mySubscriptions } from "@/lib/services/push";
import { formatDateTime } from "@/lib/core/time";
import { Card, Page, ButtonLink } from "@/components/ui";
import { PushSetup } from "./push-setup";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await pageActor();
  const devices = await mySubscriptions(actor);
  return (
    <Page title="Settings">
      <div className="grid gap-4">
        <Card title="Alerts on this phone">
          <PushSetup publicKey={config.vapid.publicKey} />
          {devices.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-medium">Phones with alerts turned on</h3>
              <ul className="divide-y divide-line text-sm">
                {devices.map((d) => (
                  <li key={d.id} className="py-2">
                    <div className="truncate">{d.user_agent ?? "Unknown device"}</div>
                    <div className="text-xs text-muted">
                      Turned on {formatDateTime(d.created_at)}
                      {d.last_success_at ? `. Last alert delivered ${formatDateTime(d.last_success_at)}` : ". No alert delivered yet"}
                      {d.disabled_at ? ". Stopped: the phone no longer accepts alerts" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card title="Your password">
          <ButtonLink href="/settings/password" variant="secondary">Change my password</ButtonLink>
        </Card>
      </div>
    </Page>
  );
}
