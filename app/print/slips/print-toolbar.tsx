"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ ids, fourUp }: { ids: string; fourUp: boolean }) {
  return (
    <div className="flex gap-2 border-b p-3 print:hidden">
      <Button onClick={() => window.print()}>Print</Button>
      <Button asChild variant="outline"><Link href={`/print/slips?ids=${ids}&layout=${fourUp ? "single" : "4up"}`}>
        {fourUp ? "One slip per sheet (1/4 A4)" : "4 slips per A4 sheet"}</Link></Button>
      <p className="self-center text-sm text-muted-foreground">Set the printer to 100% scale (no &quot;fit to page&quot;).</p>
    </div>
  );
}
