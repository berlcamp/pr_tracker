"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, FilePlus2, FileText, LayoutDashboard, ListChecks, QrCode, Route, Settings, Users,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
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

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const main = MAIN.filter((i) => !i.needsOffice || profile.office);

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="text-base font-semibold text-sidebar-primary-foreground">PR Tracker</div>
        <div className="text-xs text-sidebar-foreground/70">{profile.office?.name ?? "Administration"}</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((i) => (
                <SidebarMenuItem key={i.href}>
                  <SidebarMenuButton asChild isActive={isActive(i.href) && !(i.href === "/prs" && pathname === "/prs/new")}>
                    <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {profile.role !== "staff" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN.map((i) => (
                  <SidebarMenuItem key={i.href}>
                    <SidebarMenuButton asChild isActive={isActive(i.href)}>
                      <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="px-4 py-3 text-xs text-sidebar-foreground/60">{profile.email}</SidebarFooter>
    </Sidebar>
  );
}
