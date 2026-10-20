"use client";
// Obligations (spec §4.5, §8.5): monthly totals per account line. Cells accept expressions such as
// 100+200 (the typed expression is kept as `entry` and shown as the cell tooltip). Months after the
// selected cutoff are shaded: they can still be entered early, but a report as of the cutoff leaves them out.
import { useCallback, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CutoffSelect } from "@/components/saao/cutoff-select";
import { EditableGrid, useStableRows, type CellKind, type GridColumn } from "@/components/saao/editable-grid";
import { lineOptions, type LineOption } from "@/lib/saao/line-options";
import { useGridPaste } from "@/components/saao/use-grid-paste";
import { usePendingEdits } from "@/components/saao/use-pending-edits";
import { MONTHS, monthEnd, monthEndLabel } from "@/lib/saao/cutoff";
import { buildEditorRows, editFromChange } from "@/lib/saao/editor-state";
import { formatAmount, fromNumeric, toPeso } from "@/lib/saao/money";
import { planCell, type PasteChange } from "@/lib/saao/paste";
import type { EditorData } from "@/lib/saao/queries";
import type { DisplayRow } from "@/lib/saao/rollup";
import { setObligation } from "../../actions";
import type { DataBook } from "../data-book";

type ObRow = DisplayRow & { line: LineOption; months: number[]; entries: (string | null)[]; stored: boolean[]; total: number };

const MONTH_KEYS = MONTHS.map((_, i) => `m${i + 1}`);
const COLUMNS: GridColumn[] = [
  { key: "label", header: "Description", numeric: false, width: 320 },
  { key: "code", header: "Code", numeric: false },
  { key: "section", header: "Section", numeric: false, width: 200 },
  ...MONTHS.map((name, i) => ({ key: MONTH_KEYS[i], header: name.slice(0, 3), numeric: true, width: 120 })),
  { key: "total", header: "Total", numeric: true, width: 136 },
];
const MONTH_KIND: CellKind = { editable: "obligation" };
const NO_KIND: CellKind = { editable: false };
const ALL = "all";

const monthOf = (colKey: string) => {
  const m = /^m(\d{1,2})$/.exec(colKey);
  return m ? Number(m[1]) : null;
};
const cellKind = (_r: DisplayRow, colKey: string): CellKind => (monthOf(colKey) ? MONTH_KIND : NO_KIND);

function cellText(row: DisplayRow, c: GridColumn): string {
  const r = row as ObRow;
  if (c.key === "label") return r.label;
  if (c.key === "code") return r.row.accountCode ?? "";
  if (c.key === "section") return r.line.sectionLabel;
  if (c.key === "total") return formatAmount(r.total);
  const m = monthOf(c.key);
  // months with nothing stored are blank, so the entered figures stand out
  return m && r.stored[m - 1] ? formatAmount(r.months[m - 1]) : "";
}

function cellTitle(row: DisplayRow, colKey: string): string | undefined {
  const r = row as ObRow;
  if (colKey === "label" || colKey === "section") return r.line.path;
  const m = monthOf(colKey);
  const entry = m ? r.entries[m - 1] : null;
  return entry ? `= ${entry}` : undefined;
}

const sig = (r: ObRow) => `${r.line.path}|${r.total}|${r.months.join(",")}|${r.entries.join(",")}|${r.stored.join(",")}`;
const amountText = (c: number) => (c === 0 ? "" : formatAmount(c).replace(/,/g, ""));

export function ObligationsGrid({ book, data, initialMonth, initialLine }: {
  book: DataBook; data: EditorData; initialMonth: number; initialLine: string | null;
}) {
  const { live, saving, run } = usePendingEdits(data);
  const [month, setMonth] = useState(initialMonth);
  // tree order, active lines and paths only; amounts are not used here (obligations are read raw, all 12 months)
  const reportRows = useMemo(
    () => buildEditorRows(live, { cutoff: monthEnd(book.fiscalYear, 12), allotmentMode: book.allotmentMode, movementRule: book.movementRule }),
    [live, book],
  );
  const lines = useMemo(() => lineOptions(reportRows), [reportRows]);
  const obligations = useMemo(() => new Map(live.obligations.map((o) => [`${o.node_id}|${o.month}`, o])), [live.obligations]);

  const allRows = useMemo<ObRow[]>(() => {
    const byId = new Map(lines.map((l) => [l.id, l]));
    return reportRows.filter((r) => r.kind === "line" && r.nodeId).map((r) => {
      const months: number[] = [];
      const entries: (string | null)[] = [];
      const stored: boolean[] = [];
      for (let m = 1; m <= 12; m++) {
        const o = obligations.get(`${r.nodeId}|${m}`);
        months.push(o ? fromNumeric(o.amount) : 0);
        entries.push(o?.entry ?? null);
        stored.push(!!o);
      }
      // the Total matches the SAAO Obligation column as of the cutoff: January through the cutoff month (R6)
      const total = months.slice(0, month).reduce((s, v) => s + v, 0);
      return {
        key: r.nodeId!, type: "node" as const, row: r, depth: 0, label: r.label, amounts: null, pct: null, sectionSeq: null,
        line: byId.get(r.nodeId!)!, months, entries, stored, total,
      };
    });
  }, [reportRows, lines, obligations, month]);
  const stable = useStableRows(allRows, sig);

  // ---- filters ----
  const [lineFilter, setLineFilter] = useState(initialLine);
  const filteredLine = lineFilter ? lines.find((l) => l.id === lineFilter) ?? null : null;
  const [section, setSection] = useState(ALL);
  const [query, setQuery] = useState("");
  const sections = useMemo(() => [...new Map(lines.map((l) => [l.sectionId, l.sectionLabel])).entries()], [lines]);
  const shown = useMemo(() => {
    if (lineFilter) return filteredLine ? stable.filter((r) => r.key === filteredLine.id) : [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return stable.filter((r) => (section === ALL || r.line.sectionId === section) && words.every((w) => r.line.search.includes(w)));
  }, [stable, lineFilter, filteredLine, section, query]);
  const grandTotal = useMemo(() => shown.reduce((s, r) => s + r.total, 0), [shown]);

  const syncUrl = (m: number, line: string | null) =>
    window.history.replaceState(null, "", `?month=${m}${line ? `&line=${encodeURIComponent(line)}` : ""}`);
  function changeMonth(m: number) { setMonth(m); syncUrl(m, filteredLine?.id ?? null); }
  function clearLine() { setLineFilter(null); syncUrl(month, null); }

  const cellClassName = useCallback((_r: DisplayRow, colKey: string) => {
    const m = monthOf(colKey);
    return m && m > month ? "bg-amber-50 text-muted-foreground dark:bg-amber-950/30" : undefined;
  }, [month]);

  // ---- editing ----
  const editText = useCallback((nodeId: string, colKey: string) => {
    const m = monthOf(colKey);
    const o = m ? obligations.get(`${nodeId}|${m}`) : undefined;
    if (!o) return "";
    return o.entry ?? amountText(fromNumeric(o.amount));
  }, [obligations]);

  const commitCell = useCallback((nodeId: string, colKey: string, text: string): boolean => {
    const m = monthOf(colKey);
    if (!m) return true;
    const from = editText(nodeId, colKey);
    const plan = planCell("obligation", text, from);
    if ("error" in plan) { toast.error(plan.error); return false; }
    if (!plan.change) return true;
    const change: PasteChange = { nodeId, colKey, from, to: text, ...plan.change };
    void run([editFromChange(change, {})], () => setObligation(nodeId, m, toPeso(change.centavos ?? 0), change.entry ?? null));
    return true;
  }, [editText, run]);

  const labelOf = useMemo(() => new Map(lines.map((l) => [l.id, l.label])), [lines]);
  const rowLabel = useCallback((nodeId: string) => labelOf.get(nodeId) ?? "", [labelOf]);
  const { onPaste, dialog } = useGridPaste({ bookId: book.id, rows: shown, columns: COLUMNS, cellKind, editText, commitCell, rowLabel, run });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">Obligations</h1>
        <CutoffSelect fiscalYear={book.fiscalYear} month={month} onChange={changeMonth} />
      </div>
      <p className="text-sm text-muted-foreground">
        Monthly obligation totals per line. Amounts accept expressions such as <code>895256+57158</code>; hover a cell to see what was typed.
        {month < 12 && <> Shaded months come after {monthEndLabel(book.fiscalYear, month)}: they are saved but not counted in a report as of that date.</>}
        {" "}Total counts January to {MONTHS[month - 1]}, like the SAAO Obligation column.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {filteredLine ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm">
            <span>Showing one line: <span className="font-medium">{filteredLine.path}</span></span>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={clearLine}><X className="mr-1 size-3" />Show all lines</Button>
          </div>
        ) : (
          <>
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
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {saving ? "Saving…" : `${shown.length} lines · Total ${formatAmount(grandTotal)} · Type to edit · Ctrl+V paste from Excel`}
        </span>
      </div>
      <EditableGrid
        label="Obligations"
        rows={shown}
        columns={COLUMNS}
        cellText={cellText}
        cellKind={cellKind}
        cellTitle={cellTitle}
        cellClassName={cellClassName}
        editText={editText}
        onCommit={commitCell}
        onPaste={onPaste}
        emptyMessage={lineFilter && !filteredLine
          ? <>That line is not in this book. <button type="button" className="underline" onClick={clearLine}>Show all lines</button></>
          : lines.length === 0 ? "This book has no account lines yet. Add them in SAAO Reports." : "No lines match the filters."}
      />
      {dialog}
    </div>
  );
}
