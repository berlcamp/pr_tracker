import { ChevronDown } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogoStrip } from "./brand-logos";
import { GlobalSearch } from "./global-search";
import { SignOutMenuItem } from "./sign-out-menu-item";
import type { Profile } from "@/lib/types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Topbar({ profile, avatarUrl, bell }: { profile: Profile; avatarUrl?: string | null; bell?: React.ReactNode }) {
  const subtitle = profile.office?.name ?? profile.role.replace("_", " ");
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-3">
        <LogoStrip size={36} className="hidden gap-3 xl:flex" />
        <div aria-hidden className="hidden h-8 w-px bg-border xl:block" />
        {bell}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-11 cursor-pointer gap-2.5 px-2" aria-label={`Account menu for ${profile.full_name}`}>
              <Avatar>
                {avatarUrl && <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />}
                <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(profile.full_name)}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-44 flex-col items-start text-left leading-tight sm:flex">
                <span className="w-full truncate text-sm font-medium">{profile.full_name}</span>
                <span className="w-full truncate text-xs font-normal capitalize text-muted-foreground">{subtitle}</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="font-medium">{profile.full_name}</div>
              <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
              <div className="text-xs capitalize text-muted-foreground">{subtitle}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
