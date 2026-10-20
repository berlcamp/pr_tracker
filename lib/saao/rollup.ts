// Turns ordered report rows (live or snapshot) into display rows with subtotals
// and a grand total (spec §5 step 2). The only place totals are derived (R10).
import { half, obligationPct, sumAmounts, zeroAmounts } from "./calc";
import type { LineAmounts, ReportRow } from "./types";

export type DisplayRow = {
  key: string;
  type: "node" | "subtotal" | "grand";
  row: ReportRow;
  depth: number;
  label: string;
  amounts: LineAmounts | null;
  pct: number | null;
  sectionSeq: number | null;
};

/** Totals of line amounts for any subtotal, section, classification or grand total (R10). */
export function totalAmounts(list: LineAmounts[]): LineAmounts {
  const out = sumAmounts(list);
  // AWAITING BUDGET OFFICE (R14): total = half of summed savings, rounded once
  out.savingsHalf = half(out.savings);
  return out;
}

const pctOf = (a: LineAmounts | null) => (a ? obligationPct(a.obligation, a.adjusted) : null);

type Index = {
  bySeq: Map<number, ReportRow>;
  sectionOf: (r: ReportRow) => number;
  /** Line amounts under each row (lines include themselves). */
  linesUnder: Map<number, LineAmounts[]>;
};

function index(rows: ReportRow[]): Index {
  const bySeq = new Map(rows.map((r) => [r.seq, r]));
  const sectionCache = new Map<number, number>();
  const sectionOf = (r: ReportRow): number => {
    const cached = sectionCache.get(r.seq);
    if (cached !== undefined) return cached;
    const parent = r.parentSeq === null ? undefined : bySeq.get(r.parentSeq);
    const s = parent ? sectionOf(parent) : r.seq;
    sectionCache.set(r.seq, s);
    return s;
  };
  const linesUnder = new Map<number, LineAmounts[]>();
  for (const r of rows) {
    if (r.kind !== "line" || !r.amounts) continue;
    for (let cur: ReportRow | undefined = r; cur; cur = cur.parentSeq === null ? undefined : bySeq.get(cur.parentSeq)) {
      const list = linesUnder.get(cur.seq) ?? [];
      list.push(r.amounts);
      linesUnder.set(cur.seq, list);
    }
  }
  return { bySeq, sectionOf, linesUnder };
}

export function rollup(rows: ReportRow[], opts?: { sectionSeq?: number }): DisplayRow[] {
  const idx = index(rows);
  const filter = opts?.sectionSeq;
  const visible = filter === undefined ? rows : rows.filter((r) => idx.sectionOf(r) === filter);

  const out: DisplayRow[] = [];
  const open: ReportRow[] = [];
  const close = (h: ReportRow) => {
    const lines = idx.linesUnder.get(h.seq);
    if (h.kind === "line" || !h.showTotal || !lines?.length) return;
    const amounts = totalAmounts(lines);
    out.push({
      key: `t-${h.seq}`, type: "subtotal", row: h, depth: h.depth,
      label: h.totalLabel ?? `TOTAL ${h.label}`, amounts, pct: pctOf(amounts), sectionSeq: idx.sectionOf(h),
    });
  };

  for (const r of visible) {
    while (open.length && open[open.length - 1].depth >= r.depth) close(open.pop()!);
    const amounts = r.kind === "line" ? r.amounts : null;
    out.push({
      key: `n-${r.seq}`, type: "node", row: r, depth: r.depth, label: r.label,
      amounts, pct: pctOf(amounts), sectionSeq: idx.sectionOf(r),
    });
    open.push(r);
  }
  while (open.length) close(open.pop()!);

  if (filter === undefined) {
    const amounts = totalAmounts(rows.flatMap((r) => (r.kind === "line" && r.amounts ? [r.amounts] : [])));
    const grandRow: ReportRow = {
      seq: 0, parentSeq: null, depth: 0, kind: "section", nodeId: null, label: "GRAND TOTAL",
      accountCode: null, classificationCode: null, classificationName: null, totalLabel: null,
      showTotal: true, amounts,
    };
    out.push({ key: "grand", type: "grand", row: grandRow, depth: 0, label: "GRAND TOTAL", amounts, pct: pctOf(amounts), sectionSeq: null });
  }
  return out;
}

/** One summary per top-level node (a stand-alone top-level line is its own section). */
export function sectionSummaries(rows: ReportRow[]): { seq: number; label: string; amounts: LineAmounts; pct: number | null }[] {
  const idx = index(rows);
  return rows
    .filter((r) => r.depth === 0 && r.kind !== "note")
    .map((r) => {
      const lines = idx.linesUnder.get(r.seq);
      const amounts = lines?.length ? totalAmounts(lines) : zeroAmounts();
      return { seq: r.seq, label: r.label, amounts, pct: pctOf(amounts) };
    });
}

const UNCLASSIFIED = { code: "UNCLASSIFIED", name: "Unclassified" };

/** Totals per effective classification: own code, else nearest classification ancestor, else Unclassified. */
export function classificationTotals(rows: ReportRow[]): { code: string; name: string; amounts: LineAmounts }[] {
  const { bySeq } = index(rows);
  const groups = new Map<string, { name: string; lines: LineAmounts[] }>();
  const unclassified: LineAmounts[] = [];
  for (const r of rows) {
    if (r.kind !== "line" || !r.amounts) continue;
    let source: ReportRow | undefined = r.classificationCode ? r : undefined;
    for (let cur = r.parentSeq === null ? undefined : bySeq.get(r.parentSeq); !source && cur; cur = cur.parentSeq === null ? undefined : bySeq.get(cur.parentSeq)) {
      if (cur.kind === "classification" && cur.classificationCode) source = cur;
    }
    if (!source) {
      unclassified.push(r.amounts);
      continue;
    }
    const code = source.classificationCode!;
    const g = groups.get(code) ?? { name: source.classificationName ?? code, lines: [] };
    g.lines.push(r.amounts);
    groups.set(code, g);
  }
  const out = [...groups].map(([code, g]) => ({ code, name: g.name, amounts: totalAmounts(g.lines) }));
  if (unclassified.length) out.push({ ...UNCLASSIFIED, amounts: totalAmounts(unclassified) });
  return out;
}

/** Monthly obligation totals across all lines (12 entries, January first). */
export function monthlyTotals(rows: ReportRow[]): number[] {
  return totalAmounts(rows.flatMap((r) => (r.kind === "line" && r.amounts ? [r.amounts] : []))).months;
}
