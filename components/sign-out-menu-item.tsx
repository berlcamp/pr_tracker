"use client";
import { useRef } from "react";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** POSTs to /auth/signout; a plain link would be prefetched (GET) and is not used for sign-out. */
export function SignOutMenuItem() {
  const form = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={form} action="/auth/signout" method="post" hidden />
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); form.current?.requestSubmit(); }}>
        <LogOut className="mr-2 size-4" />Sign out
      </DropdownMenuItem>
    </>
  );
}
