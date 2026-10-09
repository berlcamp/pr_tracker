"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: "from" | "to", v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => set("from", e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => set("to", e.target.value)} /></div>
    </div>
  );
}
