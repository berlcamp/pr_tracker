import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import { SignOutMenuItem } from "./sign-out-menu-item";
import type { Profile } from "@/lib/types";

export function Topbar({ profile, bell }: { profile: Profile; bell?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        {bell}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="max-w-48 truncate">{profile.full_name}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="font-medium">{profile.full_name}</div>
              <div className="text-xs text-muted-foreground">{profile.office?.name ?? profile.role.replace("_", " ")}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
