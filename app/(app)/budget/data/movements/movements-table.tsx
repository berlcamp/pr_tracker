"use client";
// Budget movements register (spec §4.4, §8.5): one row per supplemental budget, realignment,
// augmentation, reversion or NTA reduction, with its +/− totals and net. Status changes go through
// upsertMovement with the movement's full current fields.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { formatAmount } from "@/lib/saao/money";
import type { MovementKind, MovementRule, RecordStatus } from "@/lib/saao/types";
import { cn } from "@/lib/utils";
import { upsertMovement } from "../../actions";

export type MovementItem = {
  id: string; bookId: string; kind: MovementKind; sbNumber: number | null; referenceNo: string | null; title: string | null;
  effectiveDate: string; status: RecordStatus; statusNote: string | null; remarks: string | null;
  plus: number; minus: number; net: number; lineCount: number;
};

export const KIND_LABELS: Record<MovementKind, string> = {
  supplemental: "Supplemental budget", realignment: "Realignment", augmentation: "Augmentation",
  reversion: "Reversion", nta_reduction: "NTA reduction", other: "Other",
};
export const STATUS_LABELS: Record<RecordStatus, string> = { pending: "Pending", approved: "Approved", cancelled: "Cancelled" };
const STATUS_TONE: Record<RecordStatus, string> = {
  approved: "bg-green-100 text-green-900", pending: "bg-amber-100 text-amber-900", cancelled: "bg-red-100 text-red-900",
};

export function StatusBadge({ status, note }: { status: RecordStatus; note?: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge className={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  );
}

export const crossesCancelled = (from: RecordStatus, to: RecordStatus) => from !== to && (from === "cancelled" || to === "cancelled");

/** What a cancelled movement means under the book's movement rule. */
export function cancelledRuleNote(rule: MovementRule): string {
  // PROVISIONAL (R11): whether pending/cancelled movements count depends on the book's movement rule
  return rule === "approved_only"
    ? "This book counts approved movements only, so a cancelled movement is left out of reports (R11, provisional). Its lines are kept."
    : "This book counts every entered movement, so a cancelled movement still counts in reports (R11, provisional). Its lines are kept.";
}

export const sbLabel = (n: number | null) => (n === null ? "" : `SB-${n}`);
export const movementName = (m: Pick<MovementItem, "referenceNo" | "title" | "kind" | "sbNumber">) =>
  m.referenceNo || m.title || (m.sbNumber !== null ? sbLabel(m.sbNumber) : KIND_LABELS[m.kind]);

function StatusChangeDialog({ movement, status, rule, onOpenChange }: {
  movement: MovementItem; status: RecordStatus; rule: MovementRule; onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState(movement.statusNote ?? "");
  return (
    <ConfirmActionDialog
      open onOpenChange={onOpenChange}
      title={`Mark ${movementName(movement)} as ${STATUS_LABELS[status].toLowerCase()}?`}
      description={crossesCancelled(movement.status, status) ? <p>{cancelledRuleNote(rule)}</p> : <p>The status change is recorded in the audit log.</p>}
      confirmLabel={`Mark ${STATUS_LABELS[status].toLowerCase()}`} successMessage="Status updated"
      onConfirm={() => upsertMovement({
        id: movement.id, bookId: movement.bookId, kind: movement.kind, sbNumber: movement.sbNumber, referenceNo: movement.referenceNo,
        title: movement.title, effectiveDate: movement.effectiveDate, status, statusNote: note.trim() || null, remarks: movement.remarks,
      })}
    >
      <Label htmlFor="mv-status-note">Status note (optional)</Label>
      <Input id="mv-status-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. for resolution, cancelled May 28, 2026" />
    </ConfirmActionDialog>
  );
}

const ALL = "all";
const amountCell = (v: number) => <span className="block text-right tabular-nums">{formatAmount(v)}</span>;

export function MovementsTable({ movements, rule, line }: {
  movements: MovementItem[];
  rule: MovementRule;
  /** ?line=<id> pre-filter: only movements with a line on this account line. */
  line: { id: string; path: string | null } | null;
}) {
  const [kind, setKind] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [change, setChange] = useState<{ movement: MovementItem; status: RecordStatus } | null>(null);
  const data = useMemo(
    () => movements.filter((m) => (kind === ALL || m.kind === kind) && (status === ALL || m.status === status)),
    [movements, kind, status],
  );

  const columns: ColumnDef<MovementItem>[] = [
    { accessorKey: "referenceNo", header: "Ref", cell: ({ row }) => (
      <Link className="font-medium underline-offset-2 hover:underline" href={`/budget/data/movements/${row.original.id}`}>
        {row.original.referenceNo || "(no ref)"}
      </Link>
    ) },
    { accessorKey: "kind", header: "Kind", cell: ({ row }) => KIND_LABELS[row.original.kind] },
    { accessorKey: "sbNumber", header: "SB no.", cell: ({ row }) => sbLabel(row.original.sbNumber) },
    { accessorKey: "title", header: "Title", cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.title}</span> },
    { accessorKey: "effectiveDate", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap">{row.original.effectiveDate}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} note={row.original.statusNote} /> },
    { accessorKey: "plus", header: () => <span className="block text-right">+</span>, cell: ({ row }) => amountCell(row.original.plus) },
    { accessorKey: "minus", header: () => <span className="block text-right">−</span>, cell: ({ row }) => amountCell(row.original.minus) },
    { accessorKey: "net", header: () => <span className="block text-right">Net</span>, cell: ({ row }) => amountCell(row.original.net) },
    { id: "actions", header: "", enableHiding: false, cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${movementName(row.original)}`}><MoreHorizontal className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link href={`/budget/data/movements/${row.original.id}`}>Open</Link></DropdownMenuItem>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Set status</DropdownMenuLabel>
          {(Object.keys(STATUS_LABELS) as RecordStatus[]).map((s) => (
            <DropdownMenuItem key={s} disabled={s === row.original.status} onSelect={() => setChange({ movement: row.original, status: s })}>
              {STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">Budget Movements</h1>
        <Button size="sm" asChild className="ml-auto"><Link href="/budget/data/movements/new"><Plus className="mr-1 size-4" />New movement</Link></Button>
      </div>
      {line && (
        <div className="flex w-fit items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm">
          <span>{line.path ? <>Movements on <span className="font-medium">{line.path}</span></> : "That line is not in this book."}</span>
          <Button size="sm" variant="ghost" className="h-6 px-2" asChild>
            <Link href="/budget/data/movements"><X className="mr-1 size-3" />Show all</Link>
          </Button>
        </div>
      )}
      <DataTable
        columns={columns} data={data} searchPlaceholder="Search ref or title…"
        emptyMessage={movements.length === 0 ? "No budget movements yet. Add one with New movement." : "No movements match the filters."}
        getRowClassName={(m) => cn(m.status === "cancelled" && "text-muted-foreground")}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger aria-label="Kind" className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All kinds</SelectItem>
                {(Object.keys(KIND_LABELS) as MovementKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Status" className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as RecordStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />
      {change && (
        <StatusChangeDialog key={`${change.movement.id}-${change.status}`} movement={change.movement} status={change.status} rule={rule}
          onOpenChange={(o) => !o && setChange(null)} />
      )}
    </div>
  );
}
