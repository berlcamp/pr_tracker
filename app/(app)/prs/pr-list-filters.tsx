"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOVEMENT_LABELS } from "@/lib/format";

export function PrListFilters({ offices }: { offices: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v && v !== "all") next.set(k, v); else next.delete(k);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={params.get("state") ?? "all"} onValueChange={(v) => set("state", v)}>
        <SelectTrigger className="h-9 w-36" aria-label="State"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All states</SelectItem>
          {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("office") ?? "all"} onValueChange={(v) => set("office", v)}>
        <SelectTrigger className="h-9 w-52" aria-label="Current office"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any current office</SelectItem>
          {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("origin") ?? "all"} onValueChange={(v) => set("origin", v)}>
        <SelectTrigger className="h-9 w-52" aria-label="Origin office"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any origin office</SelectItem>
          {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" aria-label="From date" className="h-9 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
      <Input type="date" aria-label="To date" className="h-9 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
      <Input type="number" aria-label="Minimum amount" placeholder="Min ₱" className="h-9 w-28" defaultValue={params.get("min") ?? ""} onBlur={(e) => set("min", e.target.value)} />
      <Input type="number" aria-label="Maximum amount" placeholder="Max ₱" className="h-9 w-28" defaultValue={params.get("max") ?? ""} onBlur={(e) => set("max", e.target.value)} />
      <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>Clear</Button>
    </div>
  );
}
