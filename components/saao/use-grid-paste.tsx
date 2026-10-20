"use client";
// Paste from Excel (spec §8.4) for the Budget Data grids: a single value commits like typing; a block
// is planned against the visible editable cells, previewed, then saved with one applyBatch.
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { applyBatch } from "@/app/(app)/budget/actions";
import { rowKeyOf, type CellKind, type CellPos, type GridColumn } from "@/components/saao/editable-grid";
import { PastePreviewDialog, type PastePreview } from "@/components/saao/paste-preview-dialog";
import type { ActionResult } from "@/lib/actions/rpc";
import { editFromChange, type LocalEdit } from "@/lib/saao/editor-state";
import { formatAmount, parseAmount } from "@/lib/saao/money";
import { changesToOps, parseClipboard, planPaste, type PastePlan, type PasteTarget } from "@/lib/saao/paste";
import type { DisplayRow } from "@/lib/saao/rollup";

const TEXT_KINDS = new Set(["label", "code", "ref"]);

export function useGridPaste({ bookId, rows, columns, cellKind, editText, commitCell, rowLabel, run }: {
  bookId: string;
  /** Rows as displayed (after filtering), so a block lands where the user sees it. */
  rows: DisplayRow[];
  columns: GridColumn[];
  cellKind: (row: DisplayRow, colKey: string) => CellKind;
  editText: (nodeId: string, colKey: string) => string;
  commitCell: (nodeId: string, colKey: string, text: string) => boolean;
  rowLabel: (nodeId: string) => string;
  run: (edits: LocalEdit[], save: () => Promise<ActionResult<unknown>>) => Promise<ActionResult<unknown>>;
}) {
  const [paste, setPaste] = useState<{ plan: PastePlan; preview: PastePreview } | null>(null);
  const header = useCallback((colKey: string) => columns.find((c) => c.key === colKey)?.header ?? colKey, [columns]);

  const onPaste = useCallback((anchor: CellPos, text: string) => {
    const cells = parseClipboard(text);
    if (cells.length === 0) return;
    const ri = rows.findIndex((r) => rowKeyOf(r) === anchor.rowKey);
    const ci = columns.findIndex((c) => c.key === anchor.colKey);
    if (ri < 0 || ci < 0) return;
    if (cells.length === 1 && cells[0].length === 1) {
      const r = rows[ri];
      if (r.row.nodeId && cellKind(r, anchor.colKey).editable) commitCell(r.row.nodeId, anchor.colKey, cells[0][0]);
      else toast.error("This cell cannot be edited here");
      return;
    }
    const targets: PasteTarget[][] = cells.map((line, r) => {
      const row = rows[ri + r];
      if (!row) return [];
      return line.slice(0, Math.max(0, columns.length - ci)).map((_, c) => {
        const col = columns[ci + c];
        return { rowKey: rowKeyOf(row), nodeId: row.row.nodeId ?? "", colKey: col.key, editable: cellKind(row, col.key).editable };
      });
    });
    const plan = planPaste(cells, targets, editText);
    const kindOf = new Map(targets.flat().map((t) => [`${t.nodeId}|${t.colKey}`, t.editable]));
    const show = (nodeId: string, colKey: string, v: string) => {
      if (TEXT_KINDS.has(String(kindOf.get(`${nodeId}|${colKey}`))) || v.trim() === "") return v;
      const p = parseAmount(v);
      return p.ok ? formatAmount(p.centavos) : v;
    };
    setPaste({
      plan,
      preview: {
        items: plan.changes.map((c) => ({
          key: `${c.nodeId}|${c.colKey}`, row: rowLabel(c.nodeId), column: header(c.colKey),
          from: show(c.nodeId, c.colKey, c.from), to: show(c.nodeId, c.colKey, c.to),
        })),
        errors: plan.errors.map((e) => {
          const t = targets[e.row][e.col];
          return { key: `${e.row}|${e.col}`, row: rowLabel(t.nodeId), column: header(t.colKey), value: cells[e.row][e.col], message: e.message };
        }),
        skipped: plan.skipped,
      },
    });
  }, [rows, columns, cellKind, editText, commitCell, rowLabel, header]);

  const apply = useCallback(async (): Promise<boolean> => {
    if (!paste) return false;
    let ops: unknown[];
    let edits: LocalEdit[];
    try {
      ops = changesToOps(paste.plan.changes, { sbMovementIds: {}, bookId });
      edits = paste.plan.changes.map((c) => editFromChange(c, {}));
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    }
    const res = await run(edits, () => applyBatch(bookId, ops));
    if (res.ok) toast.success(`${ops.length} cell${ops.length === 1 ? "" : "s"} updated`);
    return res.ok;
  }, [paste, bookId, run]);

  const dialog = <PastePreviewDialog preview={paste?.preview ?? null} onOpenChange={(o) => !o && setPaste(null)} onApply={apply} />;
  return { onPaste, dialog };
}
