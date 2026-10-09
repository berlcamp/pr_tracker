"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchTarget } from "@/lib/search";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => { e.preventDefault(); const t = searchTarget(q); if (t) router.push(t); }}
    >
      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input aria-label="Search by routing slip, PR No. or purpose" placeholder="Search RS No., PR No., purpose…"
             className="h-9 pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
