"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="flex gap-2 border-b p-3 print:hidden">
      <Button onClick={() => window.print()}>Print</Button>
      <Button asChild variant="outline"><Link href={backHref}>Back</Link></Button>
      <p className="self-center text-sm text-muted-foreground">Long bond (13 x 8.5 in) landscape. Set the printer to 100% scale.</p>
    </div>
  );
}
