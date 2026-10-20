"use client";
// Header of one budget movement (spec §4.4). Every save sends the full set of fields to upsertMovement.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { ActionResult } from "@/lib/actions/rpc";
import type { MovementKind, RecordStatus } from "@/lib/saao/types";
import { deleteMovement, upsertMovement } from "../../../actions";
import type { DataBook } from "../../data-book";
import { cancelledRuleNote, crossesCancelled, KIND_LABELS, StatusBadge, STATUS_LABELS } from "../movements-table";

export type MovementFields = {
  id: string; kind: MovementKind; sbNumber: number | null; referenceNo: string | null; title: string | null;
  effectiveDate: string; status: RecordStatus; statusNote: string | null; remarks: string | null;
};

type Form = { kind: MovementKind; sb: string; referenceNo: string; title: string; effectiveDate: string; status: RecordStatus; statusNote: string; remarks: string };

/** Today when it falls in the fiscal year, else the year's first or last day. */
function defaultDate(fy: number): string {
  const today = new Date();
  const y = today.getFullYear();
  if (y < fy) return `${fy}-01-01`;
  if (y > fy) return `${fy}-12-31`;
  return `${y}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

const toForm = (m: MovementFields | null, fy: number): Form => ({
  kind: m?.kind ?? "realignment", sb: m?.sbNumber != null ? String(m.sbNumber) : "", referenceNo: m?.referenceNo ?? "",
  title: m?.title ?? "", effectiveDate: m?.effectiveDate ?? defaultDate(fy), status: m?.status ?? "approved",
  statusNote: m?.statusNote ?? "", remarks: m?.remarks ?? "",
});

/** Client check mirroring the DB: SB number required for a supplemental budget and disallowed otherwise. */
function validate(f: Form): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.effectiveDate)) return "An effective date is required";
  if (f.kind === "supplemental") {
    if (!/^[1-9]\d*$/.test(f.sb.trim())) return "A supplemental budget needs an SB number (1, 2, 3 …)";
  } else if (f.sb.trim() !== "") {
    return "Only a supplemental budget has an SB number";
  }
  return null;
}

export function MovementForm({ book, movement, nextSb, lineCount }: {
  book: DataBook; movement: MovementFields | null; nextSb: number; lineCount: number;
}) {
  const router = useRouter();
  const saved = toForm(movement, book.fiscalYear);
  const [f, setF] = useState(saved);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const error = validate(f);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  function setKind(kind: MovementKind) {
    // the SB number belongs to supplemental budgets only; suggest the next free one
    setF({ ...f, kind, sb: kind === "supplemental" ? (f.sb || (movement?.sbNumber != null ? String(movement.sbNumber) : String(nextSb))) : "" });
  }

  const save = async (): Promise<ActionResult<string>> => upsertMovement({
    id: movement?.id ?? null, bookId: book.id, kind: f.kind, sbNumber: f.kind === "supplemental" ? Number(f.sb) : null,
    referenceNo: f.referenceNo.trim() || null, title: f.title.trim() || null, effectiveDate: f.effectiveDate,
    status: f.status, statusNote: f.statusNote.trim() || null, remarks: f.remarks.trim() || null,
  });

  const afterSave = (id: string) => {
    if (!movement) router.replace(`/budget/data/movements/${id}`);
    else router.refresh();
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (error) { toast.error(error); return; }
    // a change to or from cancelled can change the report figures, depending on the book's rule (R11)
    if (movement && crossesCancelled(movement.status, f.status)) { setConfirmOpen(true); return; }
    startTransition(async () => {
      try {
        const res = await save();
        if (!res.ok) { toast.error(res.error); return; }
        toast.success(movement ? "Movement saved" : "Movement created");
        afterSave(res.data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  const title = movement
    ? `${KIND_LABELS[movement.kind]}${movement.sbNumber !== null ? ` SB-${movement.sbNumber}` : ""}${movement.referenceNo ? ` · ${movement.referenceNo}` : ""}`
    : "New budget movement";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {movement && <StatusBadge status={movement.status} note={movement.statusNote} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="mv-kind">Kind</Label>
          <Select value={f.kind} onValueChange={(v) => setKind(v as MovementKind)}>
            <SelectTrigger id="mv-kind" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as MovementKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mv-sb">SB number</Label>
          <Input id="mv-sb" inputMode="numeric" value={f.sb} disabled={f.kind !== "supplemental"}
            placeholder={f.kind === "supplemental" ? "e.g. 4" : "Supplemental budgets only"}
            onChange={(e) => setF({ ...f, sb: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mv-ref">Reference number</Label>
          <Input id="mv-ref" value={f.referenceNo} onChange={(e) => setF({ ...f, referenceNo: e.target.value })} placeholder="e.g. 018-2026" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mv-date">Effective date</Label>
          <Input id="mv-date" type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mv-title">Title</Label>
          <Input id="mv-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mv-status">Status</Label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v as RecordStatus })}>
            <SelectTrigger id="mv-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as RecordStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mv-note">Status note</Label>
          <Input id="mv-note" value={f.statusNote} onChange={(e) => setF({ ...f, statusNote: e.target.value })} placeholder="e.g. for resolution" />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="mv-remarks">Remarks</Label>
          <Textarea id="mv-remarks" rows={2} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
        </div>
      </div>
      {f.kind === "nta_reduction" && (
        // PROVISIONAL (R3): NTA reductions are stored as negative amounts
        <p className="text-sm text-muted-foreground">NTA reduction amounts are entered as negative numbers, e.g. -1,500,000 (provisional, R3).</p>
      )}
      {f.status === "cancelled" && <p className="text-sm text-muted-foreground">{cancelledRuleNote(book.movementRule)}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || (!!movement && !dirty)}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}{movement ? "Save changes" : "Create movement"}
        </Button>
        {movement && dirty && <Button type="button" variant="ghost" disabled={pending} onClick={() => setF(saved)}>Discard changes</Button>}
        {error && dirty && <span className="text-sm text-destructive">{error}</span>}
        {movement && (
          <ConfirmActionDialog
            trigger={<Button type="button" variant="ghost" className="ml-auto text-destructive"><Trash2 className="mr-1 size-4" />Delete movement</Button>}
            title="Delete this movement?" destructive confirmLabel="Delete" successMessage="Movement deleted"
            description={lineCount > 0
              ? <p>This movement still has {lineCount} line{lineCount === 1 ? "" : "s"}. Remove them first (clear their amounts below).</p>
              : <p>The movement is removed. This is recorded in the audit log.</p>}
            canConfirm={lineCount === 0}
            onConfirm={() => deleteMovement(movement.id)}
            onSuccess={() => router.replace("/budget/data/movements")}
          />
        )}
      </div>
      {movement && (
        <ConfirmActionDialog
          open={confirmOpen} onOpenChange={setConfirmOpen}
          title={`Mark this movement as ${STATUS_LABELS[f.status].toLowerCase()}?`}
          description={<p>{cancelledRuleNote(book.movementRule)}</p>}
          confirmLabel="Save changes" successMessage="Movement saved"
          onConfirm={save}
        />
      )}
    </form>
  );
}
