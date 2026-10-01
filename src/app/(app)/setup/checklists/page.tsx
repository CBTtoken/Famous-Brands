import Link from "next/link";
import { setupContext } from "../guard";
import { listTemplates } from "@/lib/services/templates";
import { cadenceLabel } from "@/lib/core/time";
import { roleLabel } from "@/lib/core/authz";
import { Badge, ButtonLink, Card, Page } from "@/components/ui";
import { LibraryButton } from "../library-button";

export const metadata = { title: "Checklists" };

export default async function ChecklistsPage() {
  const { actor, org } = await setupContext();
  const list = await listTemplates(actor, org.orgId);
  return (
    <Page title="Checklists" back={{ href: "/setup", label: "Setup" }} actions={<ButtonLink href="/setup/checklists/new">New checklist</ButtonLink>}>
      <div className="grid gap-4">
        {list.length === 0 && (
          <Card title="Start from the 46 supervisor tasks">
            <p className="mb-3 text-sm text-muted">Loads the daily, weekly, monthly and long-term tasks from the store supervision spec as drafts. Nothing goes live until you publish it. Ranges marked CONFIRM are left empty, and no tiers are set, so you decide which tasks are critical.</p>
            <LibraryButton orgId={org.orgId} what="checklists" label="Load the 46 tasks as drafts" />
          </Card>
        )}
        {list.length > 0 && (
          <Card>
            <ul className="divide-y divide-line">
              {list.map((t) => (
                <li key={t.id} className="py-3">
                  <Link href={`/setup/checklists/${t.id}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{t.name}</span>{" "}
                      <Badge kind={t.status === "published" ? "ok" : t.status === "draft" ? "warn" : "neutral"}>{t.status === "published" ? "In use" : t.status === "draft" ? "Draft" : "Retired"}</Badge>
                      <span className="block text-xs text-muted">
                        {t.category}. {cadenceLabel[t.cadence]}{t.due_by ? ` by ${t.due_by}` : ""}. {t.items} tasks. For {t.roles.map((r) => roleLabel[r].toLowerCase()).join(", ")}. {t.stores ? `${t.stores} store${t.stores === 1 ? "" : "s"}` : "All stores"}. Done {t.runs} time{t.runs === 1 ? "" : "s"}.
                      </span>
                    </span>
                    <span className="text-sm text-brand">Change</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {list.length > 0 && !list.some((t) => t.name === "Daily supervisor checks") && (
          <Card><LibraryButton orgId={org.orgId} what="checklists" label="Load the 46 supervisor tasks as drafts" /></Card>
        )}
      </div>
    </Page>
  );
}
