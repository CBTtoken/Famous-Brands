import { redirect } from "next/navigation";
import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { roleCan } from "@/lib/core/authz";
import { Page, Empty } from "@/components/ui";

// Everyone lands where their work is: supervisors on their shift, managers on S.O.S.
export default async function Home() {
  const actor = await pageActor();
  const org = await pageOrg(actor);
  if (org && roleCan(org.role, "reports.view")) redirect("/sos");
  if (org) redirect("/shift");
  if (actor.isPlatformAdmin) redirect("/platform");
  return (
    <Page title={`Good day, ${actor.name.split(" ")[0]}`}>
      <Empty>You are not part of a shop group yet. Ask your admin to add you.</Empty>
    </Page>
  );
}
