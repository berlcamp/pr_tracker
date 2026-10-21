"use client";
// Allotments register (spec §4.6, §8.5): recorded allotments per line. Reports use them only when the
// book's allotment rule is 'recorded' (sum of approved rows dated on or before the cutoff).
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronsUpDown, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { LinePicker } from "@/components/saao/line-picker";
import { buildEditorRows } from "@/lib/saao/editor-state";
import { lineOptions, type LineOption } from "@/lib/saao/line-options";
import { formatAmount, fromNumeric, parseAmount, toPeso } from "@/lib/saao/money";
import type { EditorData } from "@/lib/saao/queries";
import type { RecordStatus } from "@/lib/saao/types";
import { deleteAllotment, upsertAllotment } from "../../actions";
import type { DataBook } from "../data-book";
import { StatusBadge, STATUS_LABELS } from "../movements/movements-table";

type AllotmentItem = {
  id: string; nodeId: string; path: string; amount: number; referenceNo: string | null; date: string | null;
  status: RecordStatus; remarks: string | null;
};

function AllotmentDialog({ allotment, lines, trigger }: { allotment: AllotmentItem | null; lines: LineOption[]; trigger: React.ReactNode }) {
  const initial = {
    nodeId: allotment?.nodeId ?? "", amount: allotment ? formatAmount(allotment.amount) : "", referenceNo: allotment?.referenceNo ?? "",
    date: allotment?.date ?? "", status: allotment?.status ?? ("approved" as RecordStatus), remarks: allotment?.remarks ?? "",
  };
  const [v, setV] = useState(initial);
  const parsed = parseAmount(v.amount);
  const line = lines.find((l) => l.id === v.nodeId);
  const amountError = v.amount.trim() === "" ? "An amount is required" : parsed.ok ? null : parsed.error;
  return (
    <ConfirmActionDialog
      trigger={trigger} title={allotment ? "Edit allotment" : "Add allotment"}
      description={<p>Only approved allotments dated on or before a report&apos;s cutoff count, and only while the book records allotments.</p>}
      confirmLabel="Save allotment" successMessage="Allotment saved"
      canConfirm={!!v.nodeId && !amountError}
      onOpenChange={(o) => o && setV(initial)}
      onConfirm={() => upsertAllotment({
        id: allotment?.id ?? null, nodeId: v.nodeId, amount: toPeso(parsed.ok ? parsed.centavos : 0),
        referenceNo: v.referenceNo.trim() || null, allotmentDate: v.date || null, status: v.status, remarks: v.remarks.trim() || null,
      })}
    >
      <Label>Line</Label>
      <LinePicker options={lines} onSelect={(o) => setV({ ...v, nodeId: o.id })} trigger={
        <Button type="button" variant="outline" className="h-auto min-h-9 w-full justify-between text-left font-normal whitespace-normal">
          <span className={line ? "" : "text-muted-foreground"}>{line?.path ?? "Pick a line…"}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      } />
      <Label htmlFor="al-amount">Amount</Label>
      <Input id="al-amount" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="e.g. 1,250,000.00" />
      {v.amount.trim() !== "" && amountError && <p className="text-sm text-destructive">{amountError}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="al-ref">Reference number</Label>
          <Input id="al-ref" value={v.referenceNo} onChange={(e) => setV({ ...v, referenceNo: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-date">Allotment date</Label>
          <Input id="al-date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </div>
      </div>
      <Label htmlFor="al-status">Status</Label>
      <Select value={v.status} onValueChange={(s) => setV({ ...v, status: s as RecordStatus })}>
        <SelectTrigger id="al-status" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABELS) as RecordStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
        </SelectContent>
      </Select>
      <Label htmlFor="al-remarks">Remarks</Label>
      <Input id="al-remarks" value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} />
    </ConfirmActionDialog>
  );
}

export function AllotmentsTable({ book, data }: { book: DataBook; data: EditorData }) {
  const lines = useMemo(
    () => lineOptions(buildEditorRows(data, { cutoff: `${book.fiscalYear}-12-31`, allotmentMode: book.allotmentMode, movementRule: book.movementRule })),
    [data, book],
  );
  const items = useMemo<AllotmentItem[]>(() => {
    const pathOf = new Map(lines.map((l) => [l.id, l.path]));
    const label = new Map(data.nodes.map((n) => [n.id, n.label]));
    return data.allotments
      .map((a) => ({
        id: a.id, nodeId: a.node_id, path: pathOf.get(a.node_id) ?? label.get(a.node_id) ?? "", amount: fromNumeric(a.amount),
        referenceNo: a.reference_no, date: a.allotment_date, status: a.status as RecordStatus, remarks: a.remarks,
      }))
      .sort((a, b) => (a.date ?? "9999") < (b.date ?? "9999") ? -1 : (a.date ?? "9999") > (b.date ?? "9999") ? 1 : 0);
  }, [data, lines]);

  const columns: ColumnDef<AllotmentItem>[] = [
    { accessorKey: "path", header: "Line", cell: ({ row }) => <span className="line-clamp-2 max-w-xl">{row.original.path}</span> },
    { accessorKey: "amount", header: () => <span className="block text-right">Amount</span>,
      cell: ({ row }) => <span className="block text-right tabular-nums">{formatAmount(row.original.amount)}</span> },
    { accessorKey: "referenceNo", header: "Reference" },
    { accessorKey: "date", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap">{row.original.date ?? "—"}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "remarks", header: "Remarks" },
    { id: "actions", header: "", enableHiding: false, cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        <AllotmentDialog allotment={row.original} lines={lines}
          trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} />
        <ConfirmActionDialog
          trigger={<Button variant="ghost" size="sm" aria-label="Delete allotment" className="text-destructive"><Trash2 className="size-4" /></Button>}
          title="Delete this allotment?" destructive confirmLabel="Delete" successMessage="Allotment deleted"
          description={<p>{formatAmount(row.original.amount)} on {row.original.path}. This is recorded in the audit log.</p>}
          onConfirm={() => deleteAllotment(row.original.id)} />
      </div>
    ) },
  ];

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Allotments</h1>
      {book.allotmentMode === "equals_adjusted" && (
        // PROVISIONAL (R5): while allotment = adjusted appropriation, recorded allotments are not used
        <p role="status" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Info className="size-4 shrink-0" />
          Allotments are not used in reports while the book&apos;s allotment rule is &apos;equals adjusted appropriation&apos; (provisional, R5).
        </p>
      )}
      <DataTable columns={columns} data={items} searchPlaceholder="Search line, reference or remarks…"
        emptyMessage="No allotments recorded yet."
        toolbar={<AllotmentDialog allotment={null} lines={lines} trigger={<Button size="sm" className="h-9"><Plus className="mr-2 size-4" />Add allotment</Button>} />} />
    </div>
  );
}
