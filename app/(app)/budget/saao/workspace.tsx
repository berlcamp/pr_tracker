"use client";
// SAAO workspace (spec §8.3): the live book as an Excel-like grid. Edits are optimistic: they are
// applied locally as pending edits on top of the last server data, sent with the single-cell
// actions (paste: one applyBatch), dropped once fresh server data arrives, and rolled back on error.
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { resolveLabels, saaoColumns } from "@/components/saao/columns";
import { EditableGrid, rowKeyOf, type CellKind, type CellPos, type FocusRequest, type GridColumn } from "@/components/saao/editable-grid";
import { FinalizeDialog, type FinalizeWarnings } from "@/components/saao/finalize-dialog";
import { PastePreviewDialog, type PastePreview } from "@/components/saao/paste-preview-dialog";
import { StructureMenu } from "@/components/saao/structure-menu";
import type { ActionResult } from "@/lib/actions/rpc";
import type { CalcContext } from "@/lib/saao/calc";
import { applyLocalEdit, buildEditorRows, childrenIndex, editFromChange, type LocalEdit } from "@/lib/saao/editor-state";
import { formatAmount, formatPct, fromNumeric, parseAmount } from "@/lib/saao/money";
import {
  changesToOps, EXTRA_FIELDS, isBalanceWord, parseClipboard, planCell, planPaste, sbNumberOfCol,
  type PasteChange, type PasteEditable, type PastePlan, type PasteTarget,
} from "@/lib/saao/paste";
import type { EditorData } from "@/lib/saao/queries";
import { rollup, type DisplayRow } from "@/lib/saao/rollup";
import type { AllotmentMode, LineAmounts, MovementRule } from "@/lib/saao/types";
import {
  addNode, applyBatch, createDraft, setExtra, setMovementLine, setObligation, startRevision, updateNode, upsertMovement,
} from "../actions";

type ReportInfo = { id: string; cutoffDate: string; version: number; status: "draft" | "finalized" | "superseded" };
type BookInfo = {
  id: string; fiscalYear: number; title: string; fundName: string;
  allotmentMode: AllotmentMode; movementRule: MovementRule; extraLabels: unknown;
};
type WsColumn = GridColumn & { get?: (a: LineAmounts) => number };
type PendingEdit = { id: number; edit: LocalEdit; done: boolean };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const monthEnd = (fy: number, m: number) => `${fy}-${pad(m)}-${pad(new Date(Date.UTC(fy, m, 0)).getUTCDate())}`;
const NO_KIND: CellKind = { editable: false };

/** What a typed value means for a node kind and column (see PasteChange for the column keys). */
function editableFor(kind: string, colKey: string): PasteEditable {
  if (colKey === "label") return "label";
  if (kind !== "line") return false;
  if (colKey === "code") return "code";
  if (colKey === "appropriation") return "appropriation";
  if (sbNumberOfCol(colKey) !== null) return "sb";
  if (colKey in EXTRA_FIELDS) return "extra";
  return false;
}

function cellKind(r: DisplayRow, colKey: string): CellKind {
  if (r.type !== "node" || !r.row.nodeId) return NO_KIND;
  if (r.row.kind === "line") {
    // Realignment and Obligation are entered on their own screens; the cells link there.
    if (colKey === "realignment") return { editable: false, href: `/budget/data/movements?line=${r.row.nodeId}` };
    if (colKey === "obligation") return { editable: false, href: `/budget/data/obligations?line=${r.row.nodeId}` };
  }
  const editable = editableFor(r.row.kind, colKey);
  return editable ? { editable } : NO_KIND;
}

function cellText(r: DisplayRow, c: GridColumn): string {
  if (c.key === "label") return r.label;
  if (c.key === "code") return r.type === "node" ? (r.row.accountCode ?? "") : "";
  if (!r.amounts) return "";
  if (c.key === "pct") return formatPct(r.pct);
  const get = (c as WsColumn).get;
  return get ? formatAmount(get(r.amounts)) : "";
}

/** A cell value as the paste preview shows it: amounts formatted, the balance keyword spelled out. */
function previewText(colKey: string, text: string): string {
  if (colKey === "label" || colKey === "code" || text.trim() === "") return text;
  if (colKey in EXTRA_FIELDS && isBalanceWord(text)) return "= Balance of Allotment";
  const p = parseAmount(text);
  return p.ok ? formatAmount(p.centavos) : text;
}

/** Amount as the editor shows it: no thousands separators, blank for zero. */
const amountText = (c: number) => (c === 0 ? "" : formatAmount(c).replace(/,/g, ""));

function sameAmounts(a: LineAmounts | null, b: LineAmounts | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k of Object.keys(a) as (keyof LineAmounts)[]) {
    if (k === "sb" || k === "months") continue;
    if (a[k] !== b[k]) return false;
  }
  const ak = Object.keys(a.sb);
  if (ak.length !== Object.keys(b.sb).length || ak.some((k) => a.sb[k] !== b.sb[k])) return false;
  return a.months.every((v, i) => v === b.months[i]);
}

function sameRow(a: DisplayRow, b: DisplayRow): boolean {
  const x = a.row, y = b.row;
  return a.key === b.key && a.type === b.type && a.label === b.label && a.depth === b.depth && a.pct === b.pct
    && a.sectionSeq === b.sectionSeq && x.seq === y.seq && x.parentSeq === y.parentSeq && x.kind === y.kind
    && x.nodeId === y.nodeId && x.accountCode === y.accountCode && x.classificationCode === y.classificationCode
    && x.totalLabel === y.totalLabel && x.showTotal === y.showTotal && sameAmounts(a.amounts, b.amounts);
}

/** Reuses unchanged row objects so memoised grid rows skip re-rendering after a commit. */
function stabilize(prev: DisplayRow[], next: DisplayRow[]): DisplayRow[] {
  const byKey = new Map(prev.map((r) => [rowKeyOf(r), r]));
  return next.map((r) => {
    const old = byKey.get(rowKeyOf(r));
    return old && sameRow(old, r) ? old : r;
  });
}

export function Workspace({ book, data, reports, offices, initialMonth, canFinalize }: {
  book: BookInfo;
  data: EditorData;
  reports: ReportInfo[];
  offices: { id: string; name: string }[];
  initialMonth: number;
  canFinalize: boolean;
}) {
  // ---- data: last server data + pending optimistic edits ----
  const [base, setBase] = useState(data);
  const [pending, setPending] = useState<PendingEdit[]>([]);
  if (data !== base) {
    // fresh server data (every successful action revalidates /budget): it includes finished edits
    setBase(data);
    setPending((p) => p.filter((e) => !e.done));
  }
  const live = useMemo(() => pending.reduce((d, p) => applyLocalEdit(d, p.edit), base), [base, pending]);
  const pendingSeq = useRef(0);

  const [month, setMonth] = useState(initialMonth);
  const cutoff = monthEnd(book.fiscalYear, month);
  const cutoffLabel = `${MONTHS[month - 1]} ${new Date(Date.UTC(book.fiscalYear, month, 0)).getUTCDate()}, ${book.fiscalYear}`;
  const ctx = useMemo<CalcContext>(() => ({ cutoff, allotmentMode: book.allotmentMode, movementRule: book.movementRule }),
    [cutoff, book.allotmentMode, book.movementRule]);

  // derived amounts are recomputed when the data changes (a commit), never per keystroke
  const reportRows = useMemo(() => buildEditorRows(live, ctx), [live, ctx]);
  const rolled = useMemo(() => rollup(reportRows), [reportRows]);
  const [stable, setStable] = useState({ src: rolled, rows: rolled });
  if (stable.src !== rolled) setStable({ src: rolled, rows: stabilize(stable.rows, rolled) });
  const display = stable.rows;

  // ---- lookups ----
  const nodeById = useMemo(() => new Map(live.nodes.map((n) => [n.id, n])), [live.nodes]);
  const children = useMemo(() => childrenIndex(live.nodes), [live.nodes]);
  const supplementals = useMemo(
    () => live.movements.filter((m) => m.kind === "supplemental" && m.sb_number !== null).sort((a, b) => a.sb_number! - b.sb_number!),
    [live.movements],
  );
  const sbKey = supplementals.map((m) => `${m.sb_number}:${m.id}`).join(",");
  const sbMovementIds = useMemo(
    () => Object.fromEntries(sbKey ? sbKey.split(",").map((p) => p.split(":")) : []) as Record<string, string>,
    [sbKey],
  );
  const lineAmount = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of live.movements) for (const l of mv.lines) m.set(`${mv.id}|${l.node_id}`, fromNumeric(l.amount));
    return m;
  }, [live.movements]);
  const extraOf = useMemo(() => new Map(live.extras.map((e) => [`${e.node_id}|${e.field}`, e])), [live.extras]);

  const labels = resolveLabels(book.extraLabels);
  const { cna_1, cna_2, cna_3, savings } = labels;
  const columns = useMemo<WsColumn[]>(() => {
    const sbNumbers = sbKey ? sbKey.split(",").map((p) => Number(p.split(":")[0])) : [];
    return [
      { key: "label", header: "Description", numeric: false },
      { key: "code", header: "Code", numeric: false },
      // same columns, in the same order, as the read-only report (components/saao/columns.ts)
      ...saaoColumns(sbNumbers, { cna_1, cna_2, cna_3, savings }).map((c) => ({ key: c.key, header: c.header, numeric: true, get: c.get })),
    ];
  }, [sbKey, cna_1, cna_2, cna_3, savings]);
  const headerOf = useMemo(() => new Map(columns.map((c) => [c.key, c.header])), [columns]);

  /** The value a cell holds as text, as the editor and the paste preview see it. */
  const editText = useCallback((nodeId: string, colKey: string): string => {
    const n = nodeById.get(nodeId);
    if (!n) return "";
    if (colKey === "label") return n.label;
    if (colKey === "code") return n.account_code ?? "";
    if (colKey === "appropriation") return amountText(fromNumeric(n.appropriation));
    const sb = sbNumberOfCol(colKey);
    if (sb !== null) return amountText(lineAmount.get(`${sbMovementIds[String(sb)]}|${nodeId}`) ?? 0);
    if (colKey in EXTRA_FIELDS) {
      const e = extraOf.get(`${nodeId}|${EXTRA_FIELDS[colKey as keyof typeof EXTRA_FIELDS]}`);
      if (!e) return "";
      return e.mode === "balance" ? "balance" : amountText(fromNumeric(e.amount));
    }
    return "";
  }, [nodeById, lineAmount, sbMovementIds, extraOf]);

  // ---- saving ----
  const settle = useCallback((ids: number[], res: ActionResult<unknown>) => {
    if (res.ok) {
      setPending((p) => p.map((e) => (ids.includes(e.id) ? { ...e, done: true } : e)));
    } else {
      toast.error(res.error);
      setPending((p) => p.filter((e) => !ids.includes(e.id)));
    }
  }, []);

  const addPending = useCallback((edits: LocalEdit[]) => {
    const ids = edits.map(() => ++pendingSeq.current);
    setPending((p) => [...p, ...edits.map((edit, i) => ({ id: ids[i], edit, done: false }))]);
    return ids;
  }, []);

  /** Sends one change with its single-cell action (the op shape is shared with paste). */
  const sendChange = useCallback((change: PasteChange): Promise<ActionResult<unknown>> => {
    const op = changesToOps([change], { sbMovementIds, bookId: book.id })[0] as Record<string, never>;
    switch (op.op as string) {
      case "update_node": return updateNode(op.id, op.patch);
      case "movement_line": return setMovementLine(op.movement_id, op.node_id, op.amount);
      case "extra": return setExtra(op.node_id, op.field, op.mode, op.amount);
      case "obligation": return setObligation(op.node_id, op.month, op.amount, op.entry);
      default: return Promise.resolve({ ok: false, error: "This cell cannot be edited" });
    }
  }, [sbMovementIds, book.id]);

  const commitCell = useCallback((nodeId: string, colKey: string, text: string): boolean => {
    const node = nodeById.get(nodeId);
    const editable = node ? editableFor(node.kind, colKey) : false;
    if (!editable) return true;
    const from = editText(nodeId, colKey);
    const plan = planCell(editable, text, from);
    if ("error" in plan) { toast.error(plan.error); return false; }
    if (!plan.change) return true;
    const change: PasteChange = { nodeId, colKey, from, to: text, ...plan.change };
    let edit: LocalEdit;
    try { edit = editFromChange(change, sbMovementIds); } catch (err) { toast.error((err as Error).message); return false; }
    const ids = addPending([edit]);
    sendChange(change).then((res) => settle(ids, res), (err) => settle(ids, { ok: false, error: err instanceof Error ? err.message : "Could not save" }));
    return true;
  }, [nodeById, editText, sbMovementIds, addPending, sendChange, settle]);

  // ---- search: matching rows plus their ancestors; subtotals are hidden while searching ----
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return display;
    const bySeq = new Map(reportRows.map((r) => [r.seq, r]));
    const keep = new Set<number>();
    for (const r of reportRows) {
      if (!r.label.toLowerCase().includes(q) && !r.accountCode?.toLowerCase().includes(q)) continue;
      for (let cur: typeof r | undefined = r; cur && !keep.has(cur.seq); cur = cur.parentSeq === null ? undefined : bySeq.get(cur.parentSeq)) {
        keep.add(cur.seq);
      }
    }
    return display.filter((d) => d.type === "node" && keep.has(d.row.seq));
  }, [q, display, reportRows]);

  // ---- paste ----
  const [paste, setPaste] = useState<{ plan: PastePlan; preview: PastePreview } | null>(null);
  const onPaste = useCallback((anchor: CellPos, text: string) => {
    const cells = parseClipboard(text);
    if (cells.length === 0) return;
    const ri = shown.findIndex((r) => rowKeyOf(r) === anchor.rowKey);
    const ci = columns.findIndex((c) => c.key === anchor.colKey);
    if (ri < 0 || ci < 0) return;
    if (cells.length === 1 && cells[0].length === 1) {
      const r = shown[ri];
      if (r.row.nodeId && cellKind(r, anchor.colKey).editable) commitCell(r.row.nodeId, anchor.colKey, cells[0][0]);
      else toast.error("This cell cannot be edited here");
      return;
    }
    const targets: PasteTarget[][] = cells.map((line, r) => {
      const row = shown[ri + r];
      if (!row) return [];
      return line.slice(0, Math.max(0, columns.length - ci)).map((_, c) => {
        const col = columns[ci + c];
        return { rowKey: rowKeyOf(row), nodeId: row.row.nodeId ?? "", colKey: col.key, editable: cellKind(row, col.key).editable };
      });
    });
    const plan = planPaste(cells, targets, editText);
    const label = (nodeId: string) => nodeById.get(nodeId)?.label ?? "";
    setPaste({
      plan,
      preview: {
        items: plan.changes.map((c) => ({ key: `${c.nodeId}|${c.colKey}`, row: label(c.nodeId), column: headerOf.get(c.colKey) ?? c.colKey,
          from: previewText(c.colKey, c.from), to: previewText(c.colKey, c.to) })),
        errors: plan.errors.map((e) => {
          const t = targets[e.row][e.col];
          return { key: `${e.row}|${e.col}`, row: label(t.nodeId), column: headerOf.get(t.colKey) ?? t.colKey, value: cells[e.row][e.col], message: e.message };
        }),
        skipped: plan.skipped,
      },
    });
  }, [shown, columns, commitCell, editText, nodeById, headerOf]);

  const applyPaste = useCallback(async (): Promise<boolean> => {
    if (!paste) return false;
    let ops: unknown[];
    let edits: LocalEdit[];
    try {
      ops = changesToOps(paste.plan.changes, { sbMovementIds, bookId: book.id });
      edits = paste.plan.changes.map((c) => editFromChange(c, sbMovementIds));
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    }
    const ids = addPending(edits);
    try {
      const res = await applyBatch(book.id, ops);
      settle(ids, res);
      if (res.ok) toast.success(`${ops.length} cell${ops.length === 1 ? "" : "s"} updated`);
      return res.ok;
    } catch (err) {
      settle(ids, { ok: false, error: err instanceof Error ? err.message : "Could not save" });
      return false;
    }
  }, [paste, sbMovementIds, book.id, addPending, settle]);

  // ---- structure ----
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const onAdded = useCallback((id: string, edit: boolean) => setFocusRequest({ rowKey: id, colKey: "label", edit, nonce: Date.now() }), []);

  const renderMenu = useCallback((row: DisplayRow, open: boolean, setOpen: (o: boolean) => void, focusGrid: () => void) => {
    const node = row.row.nodeId ? nodeById.get(row.row.nodeId) : undefined;
    if (!node) return null;
    const sibs = children.get(node.parent_id ?? "") ?? [];
    const i = sibs.findIndex((s) => s.id === node.id);
    return (
      <StructureMenu
        ctx={{ node, parent: node.parent_id ? nodeById.get(node.parent_id) ?? null : null, prev: sibs[i - 1] ?? null, next: sibs[i + 1] ?? null }}
        bookId={book.id} classifications={live.classifications} offices={offices}
        open={open} onOpenChange={setOpen} focusGrid={focusGrid} onAdded={onAdded} />
    );
  }, [nodeById, children, book.id, live.classifications, offices, onAdded]);

  const [adding, startAdding] = useTransition();
  function addSection() {
    startAdding(async () => {
      const res = await addNode({ bookId: book.id, parentId: null, afterId: null, kind: "section", label: "New section", accountCode: null, classificationId: null });
      if (!res.ok) toast.error(res.error);
      else onAdded(res.data, true);
    });
  }

  // ---- reports for the selected month ----
  const monthReports = reports.filter((r) => r.cutoffDate === cutoff);
  const draft = monthReports.find((r) => r.status === "draft") ?? null;
  const finalized = monthReports.find((r) => r.status === "finalized") ?? null;
  const [creating, startCreating] = useTransition();
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");

  const warnings = useMemo<FinalizeWarnings>(() => {
    const lines = reportRows.filter((r) => r.kind === "line" && r.nodeId);
    return {
      unclassified: lines.filter((r) => !r.classificationCode).map((r) => ({ id: r.nodeId!, label: r.label, code: r.accountCode })),
      negative: lines.filter((r) => (r.amounts?.adjusted ?? 0) < 0).map((r) => ({ id: r.nodeId!, label: r.label, adjusted: r.amounts!.adjusted })),
    };
  }, [reportRows]);

  function changeMonth(v: string) {
    const m = Number(v);
    setMonth(m);
    window.history.replaceState(null, "", `?month=${m}`);
  }

  function createDraftForMonth() {
    startCreating(async () => {
      const res = await createDraft(book.id, cutoff);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Draft created for ${cutoffLabel}`);
    });
  }

  // ---- new supplemental budget ----
  const nextSb = (supplementals.at(-1)?.sb_number ?? 0) + 1;
  const sbInitial = { referenceNo: "", date: cutoff, title: "" };
  const [sbForm, setSbForm] = useState(sbInitial);

  const saving = pending.some((p) => !p.done);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">SAAO Reports</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">As of</span>
          <Select value={String(month)} onValueChange={changeMonth}>
            <SelectTrigger aria-label="As of month" className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={name} value={String(i + 1)}>
                  {name} {new Date(Date.UTC(book.fiscalYear, i + 1, 0)).getUTCDate()}, {book.fiscalYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 text-sm" aria-label="Report state">
          {draft && <Badge className="bg-amber-100 text-amber-900">Draft v{draft.version}</Badge>}
          {finalized && <Badge className="bg-green-100 text-green-900">Finalized v{finalized.version}</Badge>}
          {!draft && !finalized && <Badge variant="outline">No report for this month</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!draft && !finalized && (
            <Button size="sm" onClick={createDraftForMonth} disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />}Create draft
            </Button>
          )}
          {draft && <Button size="sm" variant="outline" asChild><Link href={`/budget/history/${draft.id}`}>Preview</Link></Button>}
          {draft && canFinalize && <Button size="sm" onClick={() => setFinalizeOpen(true)}>Finalize</Button>}
          {finalized && !draft && canFinalize && (
            <ConfirmActionDialog
              trigger={<Button size="sm" variant="outline">Start revision</Button>}
              title={`Start revision of v${finalized.version}?`}
              description={<p>A new draft (v{finalized.version + 1}) is created from the book as it is now. The finalized v{finalized.version} stays official until the revision is finalized.</p>}
              confirmLabel="Start revision" successMessage="Revision started" canConfirm={revisionReason.trim().length > 0}
              onOpenChange={(o) => o && setRevisionReason("")}
              onConfirm={() => startRevision(finalized.id, revisionReason)}>
              <Label htmlFor="rev-reason">Reason</Label>
              <Textarea id="rev-reason" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} />
            </ConfirmActionDialog>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description or code…"
            aria-label="Search rows" className="h-8 w-72 pl-8" />
        </div>
        <Button size="sm" variant="outline" onClick={addSection} disabled={adding}>
          {adding ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Section
        </Button>
        <ConfirmActionDialog
          trigger={<Button size="sm" variant="outline"><Plus className="mr-1 size-4" />SB</Button>}
          title={`Add supplemental budget SB-${nextSb}`}
          description={<p>Adds an SB-{nextSb} column. Amounts typed in it are this supplemental budget&apos;s lines.</p>}
          confirmLabel={`Add SB-${nextSb}`} successMessage={`SB-${nextSb} added`}
          canConfirm={/^\d{4}-\d{2}-\d{2}$/.test(sbForm.date)}
          onOpenChange={(o) => o && setSbForm(sbInitial)}
          onConfirm={() => upsertMovement({
            id: null, bookId: book.id, kind: "supplemental", sbNumber: nextSb, referenceNo: sbForm.referenceNo || null,
            title: sbForm.title || null, effectiveDate: sbForm.date, status: "approved", statusNote: null, remarks: null,
          })}>
          <Label htmlFor="sb-ref">Reference number</Label>
          <Input id="sb-ref" value={sbForm.referenceNo} onChange={(e) => setSbForm({ ...sbForm, referenceNo: e.target.value })} placeholder="e.g. Ordinance No. 2026-12" />
          <Label htmlFor="sb-date">Effective date</Label>
          <Input id="sb-date" type="date" value={sbForm.date} onChange={(e) => setSbForm({ ...sbForm, date: e.target.value })} />
          <Label htmlFor="sb-title">Title (optional)</Label>
          <Input id="sb-title" value={sbForm.title} onChange={(e) => setSbForm({ ...sbForm, title: e.target.value })} />
        </ConfirmActionDialog>
        <span className="ml-auto text-xs text-muted-foreground">
          {saving ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Saving…</span>
            : "Type to edit · Enter/F2 edit · Esc cancel · Ctrl+V paste from Excel · Shift+F10 row menu"}
        </span>
      </div>

      <EditableGrid
        rows={shown}
        columns={columns}
        cellText={cellText}
        cellKind={cellKind}
        editText={editText}
        onCommit={commitCell}
        onPaste={onPaste}
        renderMenu={renderMenu}
        focusRequest={focusRequest}
        emptyMessage={q ? "No rows match the search." : "This book has no rows yet. Add a section to start."}
      />

      <PastePreviewDialog preview={paste?.preview ?? null} onOpenChange={(o) => !o && setPaste(null)} onApply={applyPaste} />
      {draft && canFinalize && finalizeOpen && (
        <FinalizeDialog open={finalizeOpen} onOpenChange={setFinalizeOpen}
          report={{ id: draft.id, version: draft.version, cutoffLabel }} warnings={warnings} />
      )}
    </div>
  );
}
