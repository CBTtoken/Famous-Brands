import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { unreadCount } from "@/lib/services/push";
import { one } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const path = (await headers()).get("x-pathname") ?? "";
  if (actor.mustChangePassword && path !== "/settings/password") redirect("/settings/password?first=1");
  const org = await pageOrg(actor);
  const unread = await unreadCount(actor);
  const demo = org ? (await one<{ is_demo: boolean }>(`select is_demo from organisations where id = $1`, [org.orgId]))?.is_demo : false;
  return (
    <>
      <AppNav actor={actor} role={org?.role ?? null} orgName={org?.orgName ?? null} unread={unread} />
      {demo && (
        <div role="note" className="bg-warn-light px-4 py-1.5 text-center text-sm font-medium text-warn print:border print:border-warn">
          Demo shop group. Not a real franchisee or store, for testing only.
        </div>
      )}
      {children}
    </>
  );
}
