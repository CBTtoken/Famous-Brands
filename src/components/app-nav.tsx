import Link from "next/link";
import { Bell, ClipboardCheck, Gauge, FileText, Package, Settings, Wrench, Building2 } from "lucide-react";
import type { UserActor } from "@/lib/core/auth";
import { roleCan, roleLabel, type Role } from "@/lib/core/authz";
import { SignOutButton } from "./sign-out-button";

type Item = { href: string; label: string; icon: React.ReactNode };

export function navItems(actor: UserActor, role: Role | null): Item[] {
  const items: Item[] = [];
  if (role && roleCan(role, "reports.view")) items.push({ href: "/sos", label: "S.O.S", icon: <Gauge size={20} aria-hidden /> });
  if (role && roleCan(role, "visit.checkin")) items.push({ href: "/shift", label: "My shift", icon: <ClipboardCheck size={20} aria-hidden /> });
  if (role && roleCan(role, "reports.view")) items.push({ href: "/reports", label: "Reports", icon: <FileText size={20} aria-hidden /> });
  if (role && roleCan(role, "alerts.view")) items.push({ href: "/alerts", label: "Alerts", icon: <Bell size={20} aria-hidden /> });
  if (role && roleCan(role, "stock.manage")) items.push({ href: "/stock", label: "Stock", icon: <Package size={20} aria-hidden /> });
  if (role && roleCan(role, "org.manage")) items.push({ href: "/setup", label: "Setup", icon: <Wrench size={20} aria-hidden /> });
  if (actor.isPlatformAdmin) items.push({ href: "/platform", label: "Groups", icon: <Building2 size={20} aria-hidden /> });
  items.push({ href: "/settings", label: "Settings", icon: <Settings size={20} aria-hidden /> });
  return items;
}

export function AppNav({ actor, role, orgName, unread }: { actor: UserActor; role: Role | null; orgName: string | null; unread: number }) {
  const items = navItems(actor, role);
  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand">
            <span className="rounded-md bg-brand px-1.5 py-0.5 text-sm text-white">S.O.S</span>
            <span className="hidden text-sm font-medium text-muted sm:inline">{orgName}</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {items.map((i) => (
              <Link key={i.href} href={i.href} className="relative rounded-md px-2.5 py-1.5 text-sm hover:bg-brand-light">
                {i.label}
                {i.href === "/alerts" && unread > 0 && <span className="ml-1 rounded-full bg-bad px-1.5 text-xs text-white">{unread}</span>}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted md:inline">{actor.name}{role ? `, ${roleLabel[role].toLowerCase()}` : ""}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {/* Phone: a fixed bar at the bottom, thumb reach. */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-surface sm:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0, 1fr))` }}>
        {items.slice(0, 5).map((i) => (
          <Link key={i.href} href={i.href} className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs">
            {i.icon}
            {i.label}
            {i.href === "/alerts" && unread > 0 && <span className="absolute right-3 top-1 rounded-full bg-bad px-1.5 text-[10px] text-white">{unread}</span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
