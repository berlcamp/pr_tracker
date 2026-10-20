// Summary of Ending Balance framework (spec §8.6): balance of allotment by top-level section ×
// effective classification, computed from the same rows as the SAAO via rollup.ts.
// AWAITING BUDGET OFFICE (R15): the grouping and which balance it shows are unconfirmed.
import { rowsOfSection } from "./dashboard";
import { classificationTotals, sectionSummaries } from "./rollup";
import type { ReportRow } from "./types";

export type EndingBalanceMatrix = {
  sections: { seq: number; label: string; byClass: Record<string, number>; total: number }[];
  classes: { code: string; name: string }[];
  columnTotals: Record<string, number>;
  grand: number;
};

const ORDER = ["PS", "MOOE", "CO"];
const rank = (code: string) => (code === "UNCLASSIFIED" ? 1000 : ORDER.includes(code) ? ORDER.indexOf(code) : 100);

export function endingBalanceMatrix(rows: ReportRow[]): EndingBalanceMatrix {
  const names = new Map<string, string>();
  const columnTotals: Record<string, number> = {};
  let grand = 0;
  const sections = sectionSummaries(rows).map((s) => {
    const byClass: Record<string, number> = {};
    let total = 0;
    for (const c of classificationTotals(rowsOfSection(rows, s.seq))) {
      byClass[c.code] = c.amounts.balanceAllotment;
      total += c.amounts.balanceAllotment;
      columnTotals[c.code] = (columnTotals[c.code] ?? 0) + c.amounts.balanceAllotment;
      if (!names.has(c.code)) names.set(c.code, c.name);
    }
    grand += total;
    return { seq: s.seq, label: s.label, byClass, total };
  });
  const classes = [...names].map(([code, name]) => ({ code, name }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
  return { sections, classes, columnTotals, grand };
}
