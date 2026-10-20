// SAAO rule registry (spec §3). Class C = confirmed from the workbook,
// P = provisional, A = awaiting Budget Office confirmation. The same rules are
// implemented in SQL by pr_tracker.saao_compute_lines; change both together.
// `klass` is frozen into every finalized report by saao_finalize (migration 0500, rule_classes);
// rules.test.ts keeps the two in step. `provisional` names the provisional part of a rule whose
// formula is confirmed (spec §3: "C (formula) / P (...)").
import type { AllotmentMode, MovementRule } from "./types";

export type Rule = { id: string; klass: "C" | "P" | "A"; title: string; provisional?: string };

export const RULES: Rule[] = [
  { id: "R1", klass: "C", title: "Supplemental = sum of all SB-n amounts for the line" },
  { id: "R2", klass: "C", title: "Realignment/Reversion = sum of all non-supplemental, non-NTA movement amounts for the line" },
  { id: "R3", klass: "P", title: "Total Changes = NTA Reduction + Supplemental + Realignment/Reversion" },
  { id: "R4", klass: "C", title: "Adjusted Appropriation = Annual + Total Changes" },
  { id: "R5", klass: "P", title: "Allotment = Adjusted Appropriation" },
  // PROVISIONAL (R6): the cutoff filter
  { id: "R6", klass: "C", title: "Obligation = sum of monthly obligations for months ≤ report cutoff month", provisional: "cutoff filter" },
  { id: "R7", klass: "P", title: "Balance of Appropriation = Allotment − Obligation" },
  { id: "R8", klass: "C", title: "Balance of Allotment = Allotment − Obligation" },
  // PROVISIONAL (R9): the zero display
  { id: "R9", klass: "C", title: "Obligation % = Obligation ÷ Adjusted × 100; when Adjusted = 0 → shown as \"—\"", provisional: "zero display" },
  { id: "R10", klass: "C", title: "Subtotals / totals = sum of descendant lines, for every amount column" },
  { id: "R11", klass: "P", title: "Movement counting: which movement statuses count in totals" },
  { id: "R12", klass: "P", title: "Movement dating: a movement counts in a report if effective date ≤ cutoff date" },
  { id: "R13", klass: "A", title: "CNA (1), CNA (2), CNA (3), Savings: blank, \"= Balance of Allotment\", or a typed amount" },
  { id: "R14", klass: "A", title: "50% of Savings = Savings × 0.5" },
  { id: "R15", klass: "A", title: "Summary of Ending Balance grouping and which balance it shows" },
];

/** True when a rule, or part of it, is not confirmed: class P or A, or a confirmed formula with a provisional part. */
export function isUnconfirmed(id: string, klass: string | undefined): boolean {
  return (klass !== undefined && klass !== "C") || Boolean(RULES.find((r) => r.id === id)?.provisional);
}

export const NTA_IN_TOTAL_CHANGES = true; // PROVISIONAL (R3)
export const BALANCE_APPROPRIATION = "allotment_minus_obligation" as const; // PROVISIONAL (R7)

/** Human sentences for the "Basis of figures" note on every report. */
export function basisOfFigures(rules: { allotmentMode: AllotmentMode; movementRule: MovementRule }): string[] {
  return [
    rules.allotmentMode === "equals_adjusted"
      ? "Allotments are taken as equal to the adjusted appropriation (R5, provisional)."
      : "Allotments are the approved allotment releases dated on or before the cutoff date (R5, provisional).",
    rules.movementRule === "all_entered"
      ? "Every entered budget movement is counted, including pending and cancelled ones (R11, provisional)."
      : "Only approved budget movements are counted (R11, provisional).",
    "A budget movement counts when its effective date is on or before the cutoff date (R12, provisional).",
    NTA_IN_TOTAL_CHANGES
      ? "Total changes include the NTA reduction on every line (R3, provisional)."
      : "Total changes exclude the NTA reduction (R3, provisional).",
    "Obligations are the monthly totals up to the cutoff month (R6; the sum is confirmed, the cutoff filter is provisional).",
    "Balance of appropriation is allotment less obligation (R7, provisional).",
    "Obligation % is obligation ÷ adjusted appropriation, shown as \"—\" where the adjusted appropriation is zero or negative (R9; the formula is confirmed, the zero display is provisional).",
    "C N A and Savings amounts are tagged or entered per line and await Budget Office confirmation; 50% of Savings is half of Savings (R13, R14, unconfirmed).",
    "The Summary of Ending Balance grouping is unconfirmed (R15).",
  ];
}
