// Lines of the "Basis of figures" note as plain text, shared by the Excel export and the print page.
import { formatDate } from "@/lib/format";
import { formatAmount } from "./money";
import { basisOfFigures } from "./rules";
import type { AllotmentMode, MovementRule } from "./types";

export type ReportStatus = {
  status: "draft" | "finalized" | "superseded";
  version: number;
  finalizedAt?: string | null;
  supersededByVersion?: number | null;
};

/**
 * Status lines for printed and exported reports. `banner` is the warning shown first and as a
 * watermark (drafts and superseded reports); `finalized` states the version and finalized date
 * (Asia/Manila). Spec §7.3: a superseded report is never presented as the official one.
 */
export function reportStatusLines(s: ReportStatus): { banner: string | null; watermark: string | null; finalized: string | null } {
  if (s.status === "draft") return { banner: "DRAFT — NOT OFFICIAL", watermark: "DRAFT", finalized: null };
  const finalized = `Finalized v${s.version}${s.finalizedAt ? ` — ${formatDate(s.finalizedAt)}` : ""}`;
  if (s.status === "superseded") {
    const by = s.supersededByVersion ? ` by v${s.supersededByVersion}` : "";
    return { banner: `SUPERSEDED${by} — not the current official report`, watermark: "SUPERSEDED", finalized };
  }
  return { banner: null, watermark: null, finalized };
}

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
