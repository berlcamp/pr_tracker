"use client";
// Appropriations (spec §8.5): every account line with its Annual Appropriation and reference, edited
// inline, next to the computed Adjusted. The baseline is never overwritten: adjustments are movements.
import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CutoffSelect } from "@/components/saao/cutoff-select";
import { EditableGrid, useStableRows, type CellKind, type GridColumn } from "@/components/saao/editable-grid";
import { lineOptions, type LineOption } from "@/lib/saao/line-options";
import { useGridPaste } from "@/components/saao/use-grid-paste";
import { usePendingEdits } from "@/components/saao/use-pending-edits";
import type { CalcContext } from "@/lib/saao/calc";
import { monthEnd, monthEndLabel } from "@/lib/saao/cutoff";
import { buildEditorRows, editFromChange } from "@/lib/saao/editor-state";
import { formatAmount, fromNumeric, toPeso } from "@/lib/saao/money";
import { planCell, type PasteChange, type PasteEditable } from "@/lib/saao/paste";
import type { EditorData } from "@/lib/saao/queries";
import type { DisplayRow } from "@/lib/saao/rollup";
import { updateNode } from "../../actions";
import type { DataBook } from "../data-book";

type ApRow = DisplayRow & { line: LineOption; ref: string };

const COLUMNS: GridColumn[] = [
  { key: "code", header: "Code", numeric: false, width: 120 },
  { key: "label", header: "Description", numeric: false, width: 360 },
  { key: "section", header: "Section", numeric: false, width: 200 },
  { key: "classification", header: "Classification", numeric: false, width: 112 },
  { key: "appropriation", header: "Annual", numeric: true, width: 144 },
  { key: "appropriation_ref", header: "Reference", numeric: false, width: 200 },
  { key: "adjusted", header: "Adjusted", numeric: true, width: 144 },
];
const EDITABLE: Record<string, PasteEditable> = { appropriation: "appropriation", appropriation_ref: "ref" };
const NO_KIND: CellKind = { editable: false };
const KINDS: Record<string, CellKind> = { appropriation: { editable: "appropriation" }, appropriation_ref: { editable: "ref" } };
const ALL = "all";
const NONE = "none"; // Select value for "Unclassified" (Radix items cannot have an empty value)

const cellKind = (_r: DisplayRow, colKey: string): CellKind => KINDS[colKey] ?? NO_KIND;

function cellText(row: DisplayRow, c: GridColumn): string {
  const r = row as ApRow;
  switch (c.key) {
    case "code": return r.row.accountCode ?? "";
    case "label": return r.label;
    case "section": return r.line.sectionLabel;
    case "classification": return r.row.classificationCode ?? "Unclassified";
    case "appropriation": return formatAmount(r.amounts?.appropriation ?? 0);
    case "appropriation_ref": return r.ref;
    case "adjusted": return formatAmount(r.amounts?.adjusted ?? 0);
    default: return "";
  }
}

const cellTitle = (row: DisplayRow, colKey: string) => (colKey === "label" || colKey === "section" ? (row as ApRow).line.path : undefined);
const sig = (r: ApRow) => `${r.line.path}|${r.row.classificationCode}|${r.ref}|${r.amounts?.appropriation}|${r.amounts?.adjusted}`;
const amountText = (c: number) => (c === 0 ? "" : formatAmount(c).replace(/,/g, ""));

export function AppropriationsGrid({ book, data, initialMonth }: { book: DataBook; data: EditorData; initialMonth: number }) {
  const { live, saving, run } = usePendingEdits(data);
  const [month, setMonth] = useState(initialMonth);
  const ctx = useMemo<CalcContext>(() => ({ cutoff: monthEnd(book.fiscalYear, month), allotmentMode: book.allotmentMode, movementRule: book.movementRule }),
    [book, month]);
  const reportRows = useMemo(() => buildEditorRows(live, ctx), [live, ctx]);
  const lines = useMemo(() => lineOptions(reportRows), [reportRows]);
  const nodeById = useMemo(() => new Map(live.nodes.map((n) => [n.id, n])), [live.nodes]);

  const allRows = useMemo<ApRow[]>(() => {
    const byId = new Map(lines.map((l) => [l.id, l]));
    return reportRows.filter((r) => r.kind === "line" && r.nodeId).map((r) => ({
      key: r.nodeId!, type: "node", row: r, depth: 0, label: r.label, amounts: r.amounts, pct: null, sectionSeq: null,
      line: byId.get(r.nodeId!)!, ref: nodeById.get(r.nodeId!)?.appropriation_ref ?? "",
    }));
  }, [reportRows, lines, nodeById]);
  const stable = useStableRows(allRows, sig);

  // ---- filters ----
  const [section, setSection] = useState(ALL);
  const [cls, setCls] = useState(ALL);
  const [query, setQuery] = useState("");
  const sections = useMemo(() => [...new Map(lines.map((l) => [l.sectionId, l.sectionLabel])).entries()], [lines]);
  const classCodes = useMemo(() => [...new Set(lines.map((l) => l.classificationCode ?? NONE))], [lines]);
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return stable.filter((r) => (section === ALL || r.line.sectionId === section)
      && (cls === ALL || (r.line.classificationCode ?? NONE) === cls)
      && words.every((w) => r.line.search.includes(w)));
  }, [stable, section, cls, query]);
  const total = useMemo(() => shown.reduce((s, r) => ({ a: s.a + (r.amounts?.appropriation ?? 0), d: s.d + (r.amounts?.adjusted ?? 0) }), { a: 0, d: 0 }), [shown]);

  // ---- editing ----
  const editText = useCallback((nodeId: string, colKey: string) => {
    const n = nodeById.get(nodeId);
    if (!n) return "";
    if (colKey === "appropriation") return amountText(fromNumeric(n.appropriation));
    if (colKey === "appropriation_ref") return n.appropriation_ref ?? "";
    return "";
  }, [nodeById]);

  const commitCell = useCallback((nodeId: string, colKey: string, text: string): boolean => {
    const editable = EDITABLE[colKey];
    if (!editable) return true;
    const from = editText(nodeId, colKey);
    const plan = planCell(editable, text, from);
    if ("error" in plan) { toast.error(plan.error); return false; }
    if (!plan.change) return true;
    const change: PasteChange = { nodeId, colKey, from, to: text, ...plan.change };
    const patch = colKey === "appropriation" ? { appropriation: toPeso(change.centavos ?? 0) } : { appropriation_ref: text.trim() || null };
    void run([editFromChange(change, {})], () => updateNode(nodeId, patch));
    return true;
  }, [editText, run]);

  const rowLabel = useCallback((nodeId: string) => nodeById.get(nodeId)?.label ?? "", [nodeById]);
  const { onPaste, dialog } = useGridPaste({ bookId: book.id, rows: shown, columns: COLUMNS, cellKind, editText, commitCell, rowLabel, run });

  function changeMonth(m: number) {
    setMonth(m);
    window.history.replaceState(null, "", `?month=${m}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">Appropriations</h1>
        <CutoffSelect fiscalYear={book.fiscalYear} month={month} onChange={changeMonth} />
      </div>
      <p className="text-sm text-muted-foreground">
        Annual Appropriation is the original figure and is never changed by adjustments. Changes go through Budget Movements;
        Adjusted shows the result as of {monthEndLabel(book.fiscalYear, month)}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search description, section or code…"
            aria-label="Search lines" className="h-8 w-72 pl-8" />
        </div>
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger aria-label="Section" className="h-8 w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sections</SelectItem>
            {sections.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cls} onValueChange={setCls}>
          <SelectTrigger aria-label="Classification" className="h-8 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All classifications</SelectItem>
            {classCodes.map((c) => <SelectItem key={c} value={c}>{c === NONE ? "Unclassified" : c}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {saving ? "Saving…" : `${shown.length} lines · Annual ${formatAmount(total.a)} · Adjusted ${formatAmount(total.d)}`}
        </span>
      </div>
      <EditableGrid
        label="Appropriations"
        rows={shown}
        columns={COLUMNS}
        cellText={cellText}
        cellKind={cellKind}
        cellTitle={cellTitle}
        editText={editText}
        onCommit={commitCell}
        onPaste={onPaste}
        emptyMessage={lines.length === 0 ? "This book has no account lines yet. Add them in SAAO Reports." : "No lines match the filters."}
      />
      {dialog}
    </div>
  );
}
