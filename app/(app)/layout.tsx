import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { NotificationBell } from "@/components/notification-bell";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  // Google profile photo from the verified session claims; the avatar falls back to initials without it.
  const { data } = await (await createClient()).auth.getClaims();
  const meta = data?.claims.user_metadata as { avatar_url?: string; picture?: string } | undefined;
  return (
    <SidebarProvider>
      <AppSidebar profile={profile} />
      <SidebarInset>
        <Topbar profile={profile} avatarUrl={meta?.avatar_url ?? meta?.picture ?? null}
                bell={profile.office ? <NotificationBell /> : null} />
        <main className="flex-1 space-y-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
