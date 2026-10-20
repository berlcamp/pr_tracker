import "server-only";
// One implementation of "resolve a report into rows, labels, header and basis" used by the history
// page, the print page and the Excel export. Finalized/superseded reports use frozen values; drafts
// use live values and need encoder+. Returns null when the report is not visible (caller -> 404).
import type { FrozenMovement } from "@/components/saao/basis-note";
import { resolveLabels, type ExtraLabels } from "@/components/saao/columns";
import { atLeast } from "./access";
import { getLiveRows, getReport, getReportRows, listBooks, listReports } from "./queries";
import type { AllotmentMode, MovementRule, ReportRow, SaaoRole } from "./types";
import type { SaaoReportRow } from "@/lib/supabase/rows";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export type ReportView = {
  report: SaaoReportRow;
  status: "draft" | "finalized" | "superseded";
  version: number;
  rows: ReportRow[];
  labels: ExtraLabels;
  headerLines: string[];
  fundName: string;
  fundCode: string;
  fiscalYear: number;
  cutoffLabel: string;
  rules: { allotmentMode: AllotmentMode; movementRule: MovementRule };
  acknowledged: FrozenMovement[];
  certifier: { name: string | null; title: string | null };
  supersededByVersion: number | null;
};

export async function loadReportView(id: string, role: SaaoRole): Promise<ReportView | null> {
  if (!UUID.test(id)) return null;
  const report = await getReport(id);
  if (!report) return null;
  const isDraft = report.status === "draft";
  if (isDraft && !atLeast(role, "encoder")) return null;
  const book = (await listBooks()).find((b) => b.id === report.book_id);
  if (!book) return null;

  const frozen = !isDraft;
  const rulesJson = asObj(report.rules);
  const headerJson = asObj(report.header);
  const rows = frozen ? await getReportRows(id) : await getLiveRows(report.book_id, report.cutoff_date);

  const labels = resolveLabels(frozen ? rulesJson.extra_labels : book.extra_labels);
  const rawLines = frozen ? headerJson.header_lines : book.header_lines;
  const rules = frozen
    ? { allotmentMode: rulesJson.allotment_mode as AllotmentMode, movementRule: rulesJson.movement_rule as MovementRule }
    : { allotmentMode: book.allotment_mode as AllotmentMode, movementRule: book.movement_rule as MovementRule };

  const ackIds = new Set(Array.isArray(report.acknowledged_unapproved) ? (report.acknowledged_unapproved as string[]) : []);
  const movements = (Array.isArray(report.movements) ? report.movements : []) as FrozenMovement[];

  let supersededByVersion: number | null = null;
  if (report.status === "superseded") {
    const siblings = await listReports(report.book_id);
    supersededByVersion = siblings.find((r) => r.revision_of === report.id)?.version ?? null;
  }

  const cutoffLabel = new Date(`${report.cutoff_date}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const src = frozen ? headerJson : { certifier_name: book.certifier_name, certifier_title: book.certifier_title };
  return {
    report, status: report.status as ReportView["status"], version: report.version, rows, labels,
    headerLines: Array.isArray(rawLines) ? rawLines.map(String) : [],
    fundName: (frozen ? String(headerJson.fund_name ?? "") : "") || book.fund?.name || book.title,
    fundCode: (frozen ? String(headerJson.fund_code ?? "") : "") || book.fund?.code || "",
    fiscalYear: frozen ? Number(headerJson.fiscal_year ?? book.fiscal_year) : book.fiscal_year,
    cutoffLabel, rules, acknowledged: movements.filter((m) => ackIds.has(m.id)),
    certifier: { name: strOrNull(src.certifier_name), title: strOrNull(src.certifier_title) },
    supersededByVersion,
  };
}
