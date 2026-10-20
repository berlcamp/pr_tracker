"use client";
// Lines of one budget movement (spec §4.4, §8.5): pick lines by search, type signed amounts, see the
// running net. Each amount is one saao_movement_lines row; clearing it removes the line.
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EditableGrid, type CellKind, type FocusRequest, type GridColumn } from "@/components/saao/editable-grid";
import { LinePicker } from "@/components/saao/line-picker";
import { useGridPaste } from "@/components/saao/use-grid-paste";
import { usePendingEdits } from "@/components/saao/use-pending-edits";
import { buildEditorRows, editFromChange } from "@/lib/saao/editor-state";
import { lineOptions, type LineOption } from "@/lib/saao/line-options";
import { formatAmount, fromNumeric, toPeso } from "@/lib/saao/money";
import { netWarning, summarizeMovement } from "@/lib/saao/movement-summary";
import { planCell, type PasteChange } from "@/lib/saao/paste";
import type { EditorData } from "@/lib/saao/queries";
import type { DisplayRow } from "@/lib/saao/rollup";
import type { MovementKind } from "@/lib/saao/types";
import { setMovementLine } from "../../../actions";
import type { DataBook } from "../../data-book";

type MlRow = DisplayRow & { path: string; amount: number; net: number; draft: boolean };

const NO_KIND: CellKind = { editable: false };
const AMOUNT_KIND: CellKind = { editable: "movement_line" };
const amountText = (c: number) => (c === 0 ? "" : formatAmount(c).replace(/,/g, ""));

function cellText(row: DisplayRow, c: GridColumn): string {
  const r = row as MlRow;
  if (c.key === "line") return r.path;
  if (c.key === "net") return formatAmount(r.net);
  return r.draft ? "" : formatAmount(r.amount);
}

export function MovementLinesGrid({ book, movementId, kind, data }: {
  book: DataBook; movementId: string; kind: MovementKind; data: EditorData;
}) {
  const { live, saving, run } = usePendingEdits(data);
  const amountKey = `mv:${movementId}`; // the paste/op column key for this movement's lines
  const columns = useMemo<GridColumn[]>(() => [
    { key: "line", header: "Line", numeric: false, width: 600 },
    { key: amountKey, header: "Amount", numeric: true, width: 160 },
    { key: "net", header: "Running net", numeric: true, width: 160 },
  ], [amountKey]);
  const cellKind = useCallback((_r: DisplayRow, colKey: string) => (colKey === amountKey ? AMOUNT_KIND : NO_KIND), [amountKey]);

  const reportRows = useMemo(
    () => buildEditorRows(live, { cutoff: `${book.fiscalYear}-12-31`, allotmentMode: book.allotmentMode, movementRule: book.movementRule }),
    [live, book],
  );
  const lines = useMemo(() => lineOptions(reportRows), [reportRows]);
  const movementLines = useMemo(() => live.movements.find((m) => m.id === movementId)?.lines ?? [], [live.movements, movementId]);
  const amounts = useMemo(() => new Map(movementLines.map((l) => [l.node_id, fromNumeric(l.amount)])), [movementLines]);
  const nodeById = useMemo(() => new Map(live.nodes.map((n) => [n.id, n])), [live.nodes]);

  // lines picked but not given an amount yet exist only here (a saved line always has an amount ≠ 0)
  const [drafts, setDrafts] = useState<string[]>([]);

  const rows = useMemo<MlRow[]>(() => {
    const rowByNode = new Map(reportRows.map((r) => [r.nodeId, r]));
    const lineById = new Map(lines.map((l, i) => [l.id, { l, i }]));
    const out: MlRow[] = [];
    let net = 0;
    const push = (nodeId: string, draft: boolean) => {
      const n = nodeById.get(nodeId);
      const r = rowByNode.get(nodeId);
      if (!n || !r) return;
      const amount = amounts.get(nodeId) ?? 0;
      net += amount;
      out.push({
        key: nodeId, type: "node", row: r, depth: 0, label: n.label, amounts: null, pct: null, sectionSeq: null,
        path: lineById.get(nodeId)?.l.path ?? n.label, amount, net, draft,
      });
    };
    // saved lines in tree order, then picked lines still waiting for an amount
    const pos = (id: string) => lineById.get(id)?.i ?? Infinity;
    [...amounts.keys()].sort((a, b) => pos(a) - pos(b)).forEach((id) => push(id, false));
    for (const id of drafts) if (!amounts.has(id)) push(id, true);
    return out;
  }, [reportRows, nodeById, amounts, lines, drafts]);

  const summary = useMemo(() => summarizeMovement([...amounts.values()].map((amount) => ({ amount }))), [amounts]);
  const warning = netWarning(kind, summary.net);
  const onMovement = useMemo(() => new Set(rows.map((r) => r.key)), [rows]);

  // ---- editing ----
  const editText = useCallback((nodeId: string) => amountText(amounts.get(nodeId) ?? 0), [amounts]);

  const commitCell = useCallback((nodeId: string, colKey: string, text: string): boolean => {
    if (colKey !== amountKey) return true;
    const from = editText(nodeId);
    const plan = planCell("movement_line", text, from);
    if ("error" in plan) { toast.error(plan.error); return false; }
    if (!plan.change) return true;
    const change: PasteChange = { nodeId, colKey, from, to: text, ...plan.change };
    setDrafts((d) => d.filter((x) => x !== nodeId));
    void run([editFromChange(change, {})], () => setMovementLine(movementId, nodeId, toPeso(change.centavos ?? 0)));
    return true;
  }, [amountKey, editText, run, movementId]);

  const rowLabel = useCallback((nodeId: string) => nodeById.get(nodeId)?.label ?? "", [nodeById]);
  const { onPaste, dialog } = useGridPaste({ bookId: book.id, rows, columns, cellKind, editText, commitCell, rowLabel, run });

  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  function addLine(o: LineOption) {
    setDrafts((d) => (d.includes(o.id) ? d : [...d, o.id]));
    setFocusRequest({ rowKey: o.id, colKey: amountKey, edit: true, nonce: Date.now() });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold">Lines</h2>
        <LinePicker options={lines} onSelect={addLine} disabledIds={onMovement}
          trigger={<Button size="sm" variant="outline"><Plus className="mr-1 size-4" />Add line</Button>} />
        <dl className="ml-auto flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums" aria-label="Movement totals">
          <div className="flex gap-1"><dt className="text-muted-foreground">Total +</dt><dd>{formatAmount(summary.plus)}</dd></div>
          <div className="flex gap-1"><dt className="text-muted-foreground">Total −</dt><dd>{formatAmount(summary.minus)}</dd></div>
          <div className="flex gap-1"><dt className="text-muted-foreground">Net</dt><dd className="font-semibold">{formatAmount(summary.net)}</dd></div>
        </dl>
      </div>
      {warning && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />{warning}
        </p>
      )}
      {kind === "nta_reduction" && (
        // PROVISIONAL (R3): NTA reductions are stored as negative amounts
        <p className="text-sm text-muted-foreground">Enter NTA reduction amounts as negative numbers (provisional, R3).</p>
      )}
      <EditableGrid
        label="Movement lines"
        rows={rows}
        columns={columns}
        cellText={cellText}
        cellKind={cellKind}
        editText={editText}
        onCommit={commitCell}
        onPaste={onPaste}
        focusRequest={focusRequest}
        emptyMessage="No lines yet. Use Add line to pick the lines this movement takes from (−) and gives to (+)."
      />
      <p className="text-xs text-muted-foreground">
        {saving ? "Saving…" : "Amounts are signed: negative takes from a line, positive adds to it. Accepts 1,234.50 and a+b. Delete clears an amount and removes the line. Ctrl+V pastes a column of amounts."}
      </p>
      {dialog}
    </section>
  );
}
