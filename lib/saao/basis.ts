// Lines of the "Basis of figures" note as plain text, shared by the Excel export and the print page.
import { formatAmount } from "./money";
import { basisOfFigures } from "./rules";
import type { AllotmentMode, MovementRule } from "./types";

export type AcknowledgedMovement = { id: string; reference_no?: string | null; title?: string | null; status?: string; total?: string | number | null };

export function basisLines(
  rules: { allotmentMode: AllotmentMode; movementRule: MovementRule },
  acknowledged: AcknowledgedMovement[],
): string[] {
  const out = basisOfFigures(rules);
  if (acknowledged.length === 0) return out;
  out.push("Unapproved movements counted (acknowledged at finalization):");
  for (const m of acknowledged) {
    const name = [m.reference_no, m.title].filter(Boolean).join(" — ") || m.id;
    const total = m.total != null && m.total !== "" ? `: ${formatAmount(Math.round(Number(m.total) * 100))}` : "";
    out.push(`${name}${m.status ? ` (${m.status})` : ""}${total}`);
  }
  return out;
}
