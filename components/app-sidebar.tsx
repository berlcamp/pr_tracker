"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, FilePlus2, FileText, LayoutDashboard, ListChecks, QrCode, Route, Settings, Users,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { citySeal } from "@/components/brand-logos";
import type { Profile } from "@/lib/types";

const MAIN = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prs", label: "Purchase Requests", icon: FileText },
  { href: "/prs/new", label: "New PR", icon: FilePlus2, needsOffice: true },
  { href: "/track", label: "Track", icon: QrCode },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];
const ADMIN = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/offices", label: "Offices", icon: Building2 },
  { href: "/admin/route", label: "Default Route", icon: Route },
  { href: "/admin/statuses", label: "Office Statuses", icon: ListChecks },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

// Roomier than the shadcn default (h-8, no gap) so items are easy to scan and hit.
const MENU = "gap-1.5";
const ITEM = "h-10 gap-3 px-3 text-sm text-sidebar-foreground/85 transition-colors [&_svg]:size-[18px] "
  + "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:hover:bg-sidebar-primary";

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const main = MAIN.filter((i) => !i.needsOffice || profile.office);

  return (
    <Sidebar>
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4 py-0">
        <Link href="/" className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <Image src={citySeal} alt="City of Ozamiz seal" className="size-10 shrink-0 rounded-full bg-white p-0.5" sizes="40px" priority />
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight text-sidebar-primary-foreground">PR Tracker</div>
            <div className="truncate text-xs text-sidebar-foreground/70">{profile.office?.name ?? "Administration"}</div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-2 px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className={MENU}>
              {main.map((i) => (
                <SidebarMenuItem key={i.href}>
                  <SidebarMenuButton asChild className={ITEM} isActive={isActive(i.href) && !(i.href === "/prs" && pathname === "/prs/new")}>
                    <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {profile.role !== "staff" && (
          <SidebarGroup>
            <SidebarGroupLabel className="mb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/55">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={MENU}>
                {ADMIN.map((i) => (
                  <SidebarMenuItem key={i.href}>
                    <SidebarMenuButton asChild className={ITEM} isActive={isActive(i.href)}>
                      <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
