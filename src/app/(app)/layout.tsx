import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { pageActor } from "@/lib/http";
import { pageOrg } from "@/lib/org-context";
import { unreadCount } from "@/lib/services/push";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const path = (await headers()).get("x-pathname") ?? "";
  if (actor.mustChangePassword && path !== "/settings/password") redirect("/settings/password?first=1");
  const org = await pageOrg(actor);
  const unread = await unreadCount(actor);
  return (
    <>
      <AppNav actor={actor} role={org?.role ?? null} orgName={org?.orgName ?? null} unread={unread} />
      {children}
    </>
  );
}
