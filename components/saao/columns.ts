import type { LineAmounts } from "@/lib/saao/types";

export type SaaoColumn = {
  key: string;
  header: string;
  group?: string;
  get: (a: LineAmounts) => number;
  editable?: "appropriation" | "sb" | "extra";
};

export type ExtraLabels = Record<"cna_1" | "cna_2" | "cna_3" | "savings", string>;

const DEFAULT_LABELS: ExtraLabels = { cna_1: "CNA (1)", cna_2: "CNA (2)", cna_3: "CNA (3)", savings: "Savings" };

/** Merges a book's/report's stored labels over the defaults; blank labels fall back. */
export function resolveLabels(raw: unknown): ExtraLabels {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = (k: keyof ExtraLabels) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string).trim() : DEFAULT_LABELS[k]);
  return { cna_1: pick("cna_1"), cna_2: pick("cna_2"), cna_3: pick("cna_3"), savings: pick("savings") };
}

/** SAAO amount columns in workbook order (spec §8.3). The "pct" column is rendered from DisplayRow.pct. */
export function saaoColumns(sbNumbers: number[], labels: ExtraLabels): SaaoColumn[] {
  return [
    { key: "appropriation", header: "Annual", get: (a) => a.appropriation, editable: "appropriation" },
    { key: "nta", header: "NTA", get: (a) => a.nta },
    ...sbNumbers.map((n) => ({ key: `sb-${n}`, header: `SB-${n}`, get: (a: LineAmounts) => a.sb[String(n)] ?? 0, editable: "sb" as const })),
    { key: "supplemental", header: "Supplemental", get: (a) => a.supplemental },
    { key: "realignment", header: "Realign/Reversion", get: (a) => a.realignment },
    { key: "totalChanges", header: "Total Changes", get: (a) => a.totalChanges },
    { key: "adjusted", header: "Adjusted", get: (a) => a.adjusted },
    { key: "allotment", header: "Allotment", get: (a) => a.allotment },
    { key: "obligation", header: "Obligation", get: (a) => a.obligation },
    { key: "balanceAppropriation", header: "Bal. Approp.", get: (a) => a.balanceAppropriation },
    { key: "balanceAllotment", header: "Bal. Allot.", get: (a) => a.balanceAllotment },
    { key: "cna1", header: labels.cna_1, get: (a) => a.cna1, editable: "extra" },
    { key: "pct", header: "%", get: (a) => a.obligation },
    { key: "cna2", header: labels.cna_2, get: (a) => a.cna2, editable: "extra" },
    { key: "cna3", header: labels.cna_3, get: (a) => a.cna3, editable: "extra" },
    { key: "savings", header: labels.savings, get: (a) => a.savings, editable: "extra" },
    { key: "savingsHalf", header: "50% Savings", get: (a) => a.savingsHalf },
  ];
}

/** Union of SB numbers present in the rows, ascending. */
export function sbNumbersOf(rows: { amounts: LineAmounts | null }[]): number[] {
  const set = new Set<number>();
  for (const r of rows) if (r.amounts) for (const k of Object.keys(r.amounts.sb)) set.add(Number(k));
  return [...set].sort((a, b) => a - b);
}
