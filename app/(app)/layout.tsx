import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { NotificationBell } from "@/components/notification-bell";
import { requireProfile } from "@/lib/auth/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <SidebarProvider>
      <AppSidebar profile={profile} />
      <SidebarInset>
        <Topbar profile={profile} bell={profile.office ? <NotificationBell /> : null} />
        <main className="flex-1 space-y-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
