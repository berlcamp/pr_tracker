// Account lines of a book with their printed paths, for pickers, filters and labels.
import type { ReportRow } from "./types";

export type LineOption = {
  id: string;
  label: string;
  code: string | null;
  /** "Section › … › Description (code)" */
  path: string;
  sectionId: string;
  sectionLabel: string;
  classificationCode: string | null;
  /** Lower-cased path and code, for filtering. */
  search: string;
};

/** Account lines of live rows (buildEditorRows: active nodes in tree order) with their paths. */
export function lineOptions(rows: ReportRow[]): LineOption[] {
  const bySeq = new Map(rows.map((r) => [r.seq, r]));
  const out: LineOption[] = [];
  for (const r of rows) {
    if (r.kind !== "line" || !r.nodeId) continue;
    const trail: ReportRow[] = [];
    for (let p = r.parentSeq === null ? undefined : bySeq.get(r.parentSeq); p; p = p.parentSeq === null ? undefined : bySeq.get(p.parentSeq)) {
      trail.unshift(p);
    }
    const section = trail[0] ?? r;
    const path = [...trail.map((t) => t.label), r.label].join(" › ") + (r.accountCode ? ` (${r.accountCode})` : "");
    out.push({
      id: r.nodeId, label: r.label, code: r.accountCode, path, sectionId: section.nodeId ?? "", sectionLabel: section.label,
      classificationCode: r.classificationCode, search: `${path} ${r.accountCode ?? ""}`.toLowerCase(),
    });
  }
  return out;
}

/** The most matches a picker renders (books have ~1,000 lines). */
export const MAX_SHOWN = 50;

/** Options whose path or code contains every word of `query`; at most `limit`, plus the total match count. */
export function filterLines(options: LineOption[], query: string, limit = MAX_SHOWN): { shown: LineOption[]; total: number } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown: LineOption[] = [];
  let total = 0;
  for (const o of options) {
    if (!words.every((w) => o.search.includes(w))) continue;
    total++;
    if (shown.length < limit) shown.push(o);
  }
  return { shown, total };
}
