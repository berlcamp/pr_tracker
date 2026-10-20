"use client";
// Finalize a draft (spec §7.2). Hard gate (R11): every counted unapproved movement needs its own
// tick, plus a final confirmation. Unclassified lines and negative adjusted appropriations are
// non-blocking warnings (controller ruling; saao_finalize does not gate on them).
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, fromNumeric } from "@/lib/saao/money";
import { finalizeReport, listUnapprovedMovements } from "@/app/(app)/budget/actions";

type Unapproved = { id: string; reference_no: string | null; title: string | null; kind: string; status: string; status_note: string | null; total: number | string };
export type FinalizeWarnings = {
  unclassified: { id: string; label: string; code: string | null }[];
  negative: { id: string; label: string; adjusted: number }[];
};

const SHOWN = 10;

export function FinalizeDialog({ open, onOpenChange, report, warnings }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: { id: string; version: number; cutoffLabel: string };
  warnings: FinalizeWarnings;
}) {
  const [items, setItems] = useState<Unapproved[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // the workspace mounts this dialog only while it is open, so state starts fresh each time
    if (!open) return;
    let cancelled = false;
    listUnapprovedMovements(report.id).then(
      (res) => { if (!cancelled) { if (res.ok) setItems(res.data ?? []); else setLoadError(res.error); } },
      (err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the movements"); },
    );
    return () => { cancelled = true; };
  }, [open, report.id]);

  const allTicked = items !== null && items.every((m) => ticked.has(m.id));
  const canFinalize = items !== null && allTicked && confirmed && !pending;

  function toggle(id: string, on: boolean) {
    setTicked((prev) => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s; });
  }

  function finalize() {
    startTransition(async () => {
      try {
        const res = await finalizeReport(report.id, [...ticked]);
        if (!res.ok) { toast.error(res.error); return; }
        toast.success(`Report v${report.version} as of ${report.cutoffLabel} finalized`);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Finalize report v{report.version} as of {report.cutoffLabel}</DialogTitle>
          <DialogDescription>
            Finalizing freezes the figures as they are now. Later corrections need a revision.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="font-semibold">Unapproved movements counted in this report</h3>
            {loadError && <p className="text-destructive">{loadError}</p>}
            {!loadError && items === null && <Skeleton className="h-16 w-full" />}
            {items !== null && items.length === 0 && <p className="text-muted-foreground">None. Every counted movement is approved.</p>}
            {items !== null && items.length > 0 && (
              <>
                <p className="text-muted-foreground">Tick each one to acknowledge that it is counted although it is not approved.</p>
                <ul className="space-y-1.5">
                  {items.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-start gap-2">
                        <Checkbox className="mt-0.5" checked={ticked.has(m.id)} onCheckedChange={(c) => toggle(m.id, !!c)}
                          aria-label={`Acknowledge ${m.reference_no ?? m.title ?? m.kind}`} />
                        <span>
                          <span className="font-medium">{[m.reference_no, m.title].filter(Boolean).join(" — ") || m.kind}</span>
                          <span className="text-muted-foreground"> · {m.kind.replace("_", " ")} · {m.status}{m.status_note ? ` (${m.status_note})` : ""}
                            {" · "}{formatAmount(fromNumeric(m.total))}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {(warnings.unclassified.length > 0 || warnings.negative.length > 0) && (
            <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />Warnings (these do not block finalizing)</h3>
              {warnings.unclassified.length > 0 && (
                <div>
                  <p>{warnings.unclassified.length} line{warnings.unclassified.length === 1 ? " has" : "s have"} no classification and will show as Unclassified:</p>
                  <ul className="list-disc pl-5">
                    {warnings.unclassified.slice(0, SHOWN).map((l) => <li key={l.id}>{l.label}{l.code ? ` (${l.code})` : ""}</li>)}
                    {warnings.unclassified.length > SHOWN && <li>and {warnings.unclassified.length - SHOWN} more</li>}
                  </ul>
                </div>
              )}
              {warnings.negative.length > 0 && (
                <div>
                  <p>{warnings.negative.length} line{warnings.negative.length === 1 ? " has" : "s have"} a negative adjusted appropriation:</p>
                  <ul className="list-disc pl-5">
                    {warnings.negative.slice(0, SHOWN).map((l) => <li key={l.id}>{l.label}: {formatAmount(l.adjusted)}</li>)}
                    {warnings.negative.length > SHOWN && <li>and {warnings.negative.length - SHOWN} more</li>}
                  </ul>
                </div>
              )}
            </section>
          )}

          <label className="flex items-start gap-2 rounded-md border p-3">
            <Checkbox className="mt-0.5" checked={confirmed} onCheckedChange={(c) => setConfirmed(!!c)} disabled={items === null} />
            <span>I have reviewed this report and want to finalize it as the official SAAO as of {report.cutoffLabel}.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canFinalize} onClick={finalize}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Finalize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
