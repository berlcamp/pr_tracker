"use client";
// Preview of a paste from Excel (spec §8.4): nothing is saved until Apply, which runs one batch.
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PastePreviewItem = { key: string; row: string; column: string; from: string; to: string };
export type PastePreviewError = { key: string; row: string; column: string; value: string; message: string };
export type PastePreview = { items: PastePreviewItem[]; errors: PastePreviewError[]; skipped: number };

export function PastePreviewDialog({ preview, onOpenChange, onApply }: {
  preview: PastePreview | null;
  onOpenChange: (open: boolean) => void;
  /** Saves the changes; resolves true when they were applied (the dialog then closes). */
  onApply: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const p = preview ?? { items: [], errors: [], skipped: 0 };
  const canApply = p.items.length > 0 && p.errors.length === 0;

  function apply() {
    startTransition(async () => {
      if (await onApply()) onOpenChange(false);
    });
  }

  return (
    <Dialog open={preview !== null} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Paste from Excel</DialogTitle>
          <DialogDescription>
            {p.items.length} cell{p.items.length === 1 ? "" : "s"} will change
            {p.skipped > 0 && <>; {p.skipped} cell{p.skipped === 1 ? " lands" : "s land"} on calculated or non-editable columns or past the grid and will be skipped</>}.
            {p.errors.length > 0 && " Fix the cells marked in red in Excel and paste again."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Row</th>
                <th className="px-2 py-1.5 text-left font-semibold">Column</th>
                <th className="px-2 py-1.5 text-right font-semibold">Old</th>
                <th className="px-2 py-1.5 text-right font-semibold">New</th>
              </tr>
            </thead>
            <tbody>
              {p.errors.map((e) => (
                <tr key={e.key} className="bg-destructive/10 text-destructive">
                  <td className="border-t px-2 py-1">{e.row}</td>
                  <td className="border-t px-2 py-1">{e.column}</td>
                  <td className="border-t px-2 py-1 text-right">&ldquo;{e.value}&rdquo;</td>
                  <td className="border-t px-2 py-1 text-right font-medium">{e.message}</td>
                </tr>
              ))}
              {p.items.map((i) => (
                <tr key={i.key}>
                  <td className="max-w-72 truncate border-t px-2 py-1" title={i.row}>{i.row}</td>
                  <td className="border-t px-2 py-1">{i.column}</td>
                  <td className="border-t px-2 py-1 text-right text-muted-foreground tabular-nums">{i.from || "—"}</td>
                  <td className="border-t px-2 py-1 text-right tabular-nums">{i.to || "(blank)"}</td>
                </tr>
              ))}
              {p.items.length === 0 && p.errors.length === 0 && (
                <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Nothing to change.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !canApply} onClick={apply}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Apply {p.items.length > 0 ? p.items.length : ""} change{p.items.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
