// Totals of one budget movement's lines (spec §4.4). Amounts are integer centavos.
import { formatAmount } from "./money";
import type { MovementKind } from "./types";

export type MovementSummary = { plus: number; minus: number; net: number };

/** Total of the positive lines, total of the negative lines (≤ 0) and their net. */
export function summarizeMovement(lines: { amount: number }[]): MovementSummary {
  let plus = 0;
  let minus = 0;
  for (const l of lines) {
    if (l.amount > 0) plus += l.amount;
    else minus += l.amount;
  }
  return { plus, minus, net: plus + minus };
}

/** Non-blocking warning: a realignment or augmentation should move money between lines, so its lines net to zero. */
export function netWarning(kind: MovementKind, net: number): string | null {
  if ((kind !== "realignment" && kind !== "augmentation") || net === 0) return null;
  const peso = net < 0 ? `-₱${formatAmount(-net)}` : `₱${formatAmount(net)}`;
  return `This realignment does not net to zero (net ${peso})`;
}
