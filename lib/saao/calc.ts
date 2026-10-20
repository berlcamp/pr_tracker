// Live-preview mirror of pr_tracker.saao_compute_lines (spec §3, §5). The SQL
// function is the official computation; both are tested against
// lib/saao/fixtures/basic.json. All amounts are integer centavos.
import { NTA_IN_TOTAL_CHANGES } from "./rules";
import type { AllotmentMode, LineAmounts, MovementKind, MovementRule, RecordStatus } from "./types";

export type LineInput = {
  appropriation: number;
  movements: { kind: MovementKind; sbNumber: number | null; status: RecordStatus; effectiveDate: string; amount: number }[];
  obligations: { month: number; amount: number }[];
  allotments: { amount: number; status: RecordStatus; date: string }[];
  extras: Partial<Record<"cna_1" | "cna_2" | "cna_3" | "savings", { mode: "balance" | "amount"; amount: number | null }>>;
};

export type CalcContext = { cutoff: string /* YYYY-MM-DD */; allotmentMode: AllotmentMode; movementRule: MovementRule };

export function zeroAmounts(): LineAmounts {
  return {
    appropriation: 0, nta: 0, sb: {}, supplemental: 0, realignment: 0, totalChanges: 0, adjusted: 0,
    allotment: 0, obligation: 0, months: Array(12).fill(0), balanceAppropriation: 0, balanceAllotment: 0,
    cna1: 0, cna2: 0, cna3: 0, savings: 0, savingsHalf: 0,
  };
}

const SCALAR_FIELDS = [
  "appropriation", "nta", "supplemental", "realignment", "totalChanges", "adjusted", "allotment", "obligation",
  "balanceAppropriation", "balanceAllotment", "cna1", "cna2", "cna3", "savings", "savingsHalf",
] as const;

/** Column-wise sum of line amounts (R10). savingsHalf is the sum of the line halves. */
export function sumAmounts(list: LineAmounts[]): LineAmounts {
  const out = zeroAmounts();
  for (const a of list) {
    for (const f of SCALAR_FIELDS) out[f] += a[f];
    for (const [k, v] of Object.entries(a.sb)) out.sb[k] = (out.sb[k] ?? 0) + v;
    for (let i = 0; i < 12; i++) out.months[i] += a.months[i] ?? 0;
  }
  return out;
}

/** R9: Obligation ÷ Adjusted × 100; null when Adjusted ≤ 0. */
export function obligationPct(obligation: number, adjusted: number): number | null {
  if (adjusted <= 0) return null; // PROVISIONAL (R9) zero/negative display
  return (obligation / adjusted) * 100;
}

/** Half away from zero, matching SQL round(x / 2, 2) on numeric(18,2). */
function half(c: number): number {
  return Math.sign(c) * Math.round(Math.abs(c) / 2) || 0;
}

export function computeLine(input: LineInput, ctx: CalcContext): LineAmounts {
  const cutoffMonth = Number(ctx.cutoff.slice(5, 7));

  let nta = 0;
  let supplemental = 0;
  let realignment = 0;
  const sb: Record<string, number> = {};
  for (const m of input.movements) {
    if (m.effectiveDate > ctx.cutoff) continue; // PROVISIONAL (R12)
    if (ctx.movementRule === "approved_only" && m.status !== "approved") continue; // PROVISIONAL (R11)
    if (m.kind === "supplemental") {
      // R1: every SB number, no fixed column range
      const key = String(m.sbNumber);
      sb[key] = (sb[key] ?? 0) + m.amount;
      supplemental += m.amount;
    } else if (m.kind === "nta_reduction") {
      nta += m.amount;
    } else {
      realignment += m.amount; // R2
    }
  }

  const totalChanges = (NTA_IN_TOTAL_CHANGES ? nta : 0) + supplemental + realignment; // PROVISIONAL (R3)
  const adjusted = input.appropriation + totalChanges; // R4

  let allotment: number;
  if (ctx.allotmentMode === "equals_adjusted") {
    allotment = adjusted; // PROVISIONAL (R5)
  } else {
    allotment = 0;
    for (const a of input.allotments) {
      if (a.status === "approved" && a.date <= ctx.cutoff) allotment += a.amount;
    }
  }

  // R6: months up to the cutoff month; later months are left out of the report entirely.
  const months: number[] = Array(12).fill(0);
  for (const o of input.obligations) {
    if (o.month >= 1 && o.month <= cutoffMonth) months[o.month - 1] += o.amount;
  }
  const obligation = months.reduce((s, v) => s + v, 0);

  const balanceAppropriation = allotment - obligation; // PROVISIONAL (R7) BALANCE_APPROPRIATION
  const balanceAllotment = allotment - obligation; // R8

  // AWAITING BUDGET OFFICE (R13): blank (0), "= Balance of Allotment", or a typed amount.
  const extra = (field: keyof LineInput["extras"]): number => {
    const e = input.extras[field];
    if (!e) return 0;
    return e.mode === "balance" ? balanceAllotment : e.amount ?? 0;
  };
  const savings = extra("savings");

  return {
    appropriation: input.appropriation,
    nta,
    sb,
    supplemental,
    realignment,
    totalChanges,
    adjusted,
    allotment,
    obligation,
    months,
    balanceAppropriation,
    balanceAllotment,
    cna1: extra("cna_1"),
    cna2: extra("cna_2"),
    cna3: extra("cna_3"),
    savings,
    savingsHalf: half(savings), // AWAITING BUDGET OFFICE (R14)
  };
}
