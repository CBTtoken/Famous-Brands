import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan } from "@/lib/core/authz";
import { Empty, Page } from "@/components/ui";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (!org || !roleCan(org.role, "org.manage")) {
    return <Page title="Setup"><Empty>Setup is for admins. Your role does not include it.</Empty></Page>;
  }
  return children;
}
