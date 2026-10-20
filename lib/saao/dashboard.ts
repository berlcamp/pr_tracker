// Budget Dashboard figures (spec §8.2). Pure functions over report rows (snapshot or live);
// every total goes through rollup.ts so the dashboard and the SAAO always agree (R10).
import { obligationPct } from "./calc";
import { sectionSummaries, totalAmounts } from "./rollup";
import type { LineAmounts, ReportRow } from "./types";

/** The official report to open by default: the latest-cutoff finalized one, never a draft (spec §7.4). */
export function pickDefaultReport(reports: { id: string; status: string; cutoff_date: string }[]): string | null {
  let best: { id: string; cutoff_date: string } | null = null;
  for (const r of reports) {
    if (r.status !== "finalized") continue;
    if (!best || r.cutoff_date > best.cutoff_date) best = r;
  }
  return best?.id ?? null;
}

export type SummaryCard = { key: string; label: string; centavos: number | null; pct?: number | null; provisional?: string };

const linesOf = (rows: ReportRow[]): LineAmounts[] =>
  rows.flatMap((r) => (r.kind === "line" && r.amounts ? [r.amounts] : []));

/** The 8 summary cards (spec §8.2) from the grand total of `rows`. */
export function summaryCards(rows: ReportRow[]): SummaryCard[] {
  const t = totalAmounts(linesOf(rows));
  return [
    { key: "appropriation", label: "Annual Appropriation", centavos: t.appropriation },
    { key: "changes", label: "Budget Changes", centavos: t.totalChanges },
    { key: "adjusted", label: "Adjusted Appropriation", centavos: t.adjusted },
    // PROVISIONAL (R5): allotment equals adjusted appropriation under 'equals_adjusted'
    { key: "allotment", label: "Allotments", centavos: t.allotment, provisional: "R5" },
    { key: "obligation", label: "Obligations", centavos: t.obligation },
    // PROVISIONAL (R7): balance of appropriation = allotment − obligation
    { key: "balanceAppropriation", label: "Balance of Appropriation", centavos: t.balanceAppropriation, provisional: "R7" },
    // PROVISIONAL (R5): balance of allotment depends on the allotment figure
    { key: "balanceAllotment", label: "Balance of Allotment", centavos: t.balanceAllotment, provisional: "R5" },
    // PROVISIONAL (R9): null when adjusted <= 0
    { key: "pct", label: "Obligation %", centavos: null, pct: obligationPct(t.obligation, t.adjusted) },
  ];
}

export type SectionFigure = { seq: number | null; label: string; amounts: LineAmounts; pct: number | null };

/** The `n` sections with the largest obligations; the rest are summed into one "Others" row (seq null). */
export function topSections(rows: ReportRow[], n = 15): SectionFigure[] {
  const sorted = [...sectionSummaries(rows)].sort((a, b) => b.amounts.obligation - a.amounts.obligation);
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n);
  const amounts = totalAmounts(rest.map((s) => s.amounts));
  return [...sorted.slice(0, n), { seq: null, label: "Others", amounts, pct: obligationPct(amounts.obligation, amounts.adjusted) }];
}

/** Rows of one top-level section (its subtree, in tree order). Rows must be in tree order. */
export function rowsOfSection(rows: ReportRow[], sectionSeq: number): ReportRow[] {
  const out: ReportRow[] = [];
  let current: number | null = null;
  for (const r of rows) {
    if (r.depth === 0) current = r.seq;
    if (current === sectionSeq) out.push(r);
  }
  return out;
}

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });

/** Display-only compact peso label for axes and bar ends ("₱1.52B"). Never used for arithmetic. */
export function compactPeso(centavos: number): string {
  const s = COMPACT.format(Math.abs(centavos) / 100);
  return `${centavos < 0 ? "-" : ""}₱${s}`;
}
