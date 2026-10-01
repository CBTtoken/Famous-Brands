import { setupContext } from "../../guard";
import { getTemplate } from "@/lib/services/templates";
import { listStores } from "@/lib/services/org";
import { Page } from "@/components/ui";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "Checklist" };

export default async function TemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const { actor, org } = await setupContext();
  const stores = (await listStores(actor, org.orgId)).map((s) => ({ id: s.id, name: s.name }));
  const t = templateId === "new" ? null : await getTemplate(actor, templateId);
  return (
    <Page title={t ? t.name : "New checklist"} back={{ href: "/setup/checklists", label: "Checklists" }}>
      <TemplateEditor orgId={org.orgId} stores={stores} initial={t ? JSON.parse(JSON.stringify(t)) : null} />
    </Page>
  );
}
