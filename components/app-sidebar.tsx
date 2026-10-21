"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight, BarChart3, Building2, FilePlus2, FileText, History, Landmark, LayoutDashboard, ListChecks, PieChart,
  QrCode, Receipt, Route, Scale, Settings, Sheet, SlidersHorizontal, Users, Wallet,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { citySeal } from "@/components/brand-logos";
import type { Profile } from "@/lib/types";
import type { SaaoRole } from "@/lib/saao/types";

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
const BUDGET = [
  { href: "/budget", label: "Budget Dashboard", icon: PieChart },
  { href: "/budget/saao", label: "SAAO Reports", icon: Sheet },
];
const BUDGET_DATA = [
  { href: "/budget/data/appropriations", label: "Appropriations", icon: Landmark },
  { href: "/budget/data/allotments", label: "Allotments", icon: Wallet },
  { href: "/budget/data/obligations", label: "Obligations", icon: Receipt },
  { href: "/budget/data/movements", label: "Budget Movements", icon: ArrowLeftRight },
];
const BUDGET_AFTER = [
  { href: "/budget/ending-balance", label: "Ending Balance", icon: Scale },
  { href: "/budget/history", label: "Report History", icon: History },
];
const BUDGET_SETTINGS = { href: "/budget/settings", label: "Budget Settings", icon: SlidersHorizontal };

// Roomier than the shadcn default (h-8, no gap) so items are easy to scan and hit.
const MENU = "gap-1.5";
const ITEM = "h-10 gap-3 px-3 text-sm text-sidebar-foreground/85 transition-colors [&_svg]:size-[18px] "
  + "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:hover:bg-sidebar-primary";

export function AppSidebar({ profile, saaoRole }: { profile: Profile; saaoRole: SaaoRole | null }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const isPrAdmin = profile.role !== "staff";
  // Budget users get the full group; PR admins without a budget role only get Budget Settings (Access tab).
  const budgetFull = saaoRole !== null;
  const budgetVisible = budgetFull || isPrAdmin;
  const budgetSettings = saaoRole === "budget_admin" || isPrAdmin;
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
        {budgetVisible && (
          <SidebarGroup>
            <SidebarGroupLabel className="mb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/55">Budget</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={MENU}>
                {budgetFull && BUDGET.map((i) => (
                  <SidebarMenuItem key={i.href}>
                    <SidebarMenuButton asChild className={ITEM} isActive={isActive(i.href)}>
                      <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {budgetFull && (
                  <li role="presentation">
                    <SidebarGroupLabel className="mt-2 h-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">Budget Data</SidebarGroupLabel>
                  </li>
                )}
                {budgetFull && BUDGET_DATA.map((i) => (
                  <SidebarMenuItem key={i.href}>
                    <SidebarMenuButton asChild className={ITEM} isActive={isActive(i.href)}>
                      <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {budgetFull && BUDGET_AFTER.map((i) => (
                  <SidebarMenuItem key={i.href}>
                    <SidebarMenuButton asChild className={ITEM} isActive={isActive(i.href)}>
                      <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {budgetSettings && [BUDGET_SETTINGS].map((i) => (
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
