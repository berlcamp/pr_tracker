"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { searchTarget } from "@/lib/search";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses the search from anywhere, unless the user is already typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="group relative flex h-10 w-full max-w-md min-w-0 items-center rounded-lg border border-input bg-muted/50 transition-[color,background-color,border-color,box-shadow] hover:bg-muted/70 focus-within:border-ring focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/30"
      onSubmit={(e) => { e.preventDefault(); const t = searchTarget(q); if (t) { router.push(t); input.current?.blur(); } }}
    >
      <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground transition-colors group-focus-within:text-foreground" aria-hidden />
      <input ref={input} type="search" aria-label="Search by routing slip, PR No. or purpose" placeholder="Search RS No., PR No., purpose…"
             autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)}
             onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}
             className="h-full w-full min-w-0 bg-transparent pr-10 pl-9 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
      {q ? (
        <button type="button" aria-label="Clear search" onClick={() => { setQ(""); input.current?.focus(); }}
                className="absolute right-1.5 flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <X className="size-4" aria-hidden />
        </button>
      ) : (
        <kbd aria-hidden className="pointer-events-none absolute right-2.5 hidden h-5 items-center rounded border bg-background px-1.5 font-mono text-[11px] font-medium text-muted-foreground sm:flex group-focus-within:hidden">/</kbd>
      )}
    </form>
  );
}
