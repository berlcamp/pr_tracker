import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import { SignOutMenuItem } from "./sign-out-menu-item";
import { initials } from "@/lib/format";
import type { Profile } from "@/lib/types";

export function Topbar({ profile, avatarUrl, bell }: { profile: Profile; avatarUrl?: string | null; bell?: React.ReactNode }) {
  const subtitle = profile.office?.name ?? profile.role.replace("_", " ");
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger />
      <GlobalSearch />
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {profile.office && (
          <Button asChild className="h-10 cursor-pointer gap-1.5 px-3 sm:px-4">
            <Link href="/prs/new" aria-label="New purchase request">
              <Plus className="size-4" aria-hidden /><span className="hidden sm:inline">New PR</span>
            </Link>
          </Button>
        )}
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
