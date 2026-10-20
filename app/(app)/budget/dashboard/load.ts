import "server-only";
// Picks the report a Budget Dashboard / Ending Balance view shows (spec §7.4, §8.2, §8.6) and loads
// its rows: the finalized report of the chosen cutoff (default: latest finalized cutoff), or, for
// encoder+ with ?preview=draft, the live rows of the latest draft. Never falls back to draft data.
import { atLeast, requireSaao } from "@/lib/saao/access";
import { getSelectedBookId } from "@/lib/saao/book-cookie";
import { monthEndLabel } from "@/lib/saao/cutoff";
import { pickDefaultReport } from "@/lib/saao/dashboard";
import { fromNumeric } from "@/lib/saao/money";
import { getLiveRows, getReportRows, listBooks, listCountedMovements, listReports, type CountedMovement } from "@/lib/saao/queries";
import { RULES } from "@/lib/saao/rules";
import type { AllotmentMode, MovementRule, ReportRow, SaaoRole } from "@/lib/saao/types";
import { createClient } from "@/lib/supabase/server";
import type { SaaoReportRow } from "@/lib/supabase/rows";

export type ViewParams = { book?: string | string[]; report?: string | string[]; section?: string | string[]; preview?: string | string[] };

export type LoadedView = {
  role: SaaoRole;
  canPreview: boolean;
  preview: boolean;
  book: { id: string; title: string; fiscalYear: number; fundName: string } | null;
  /** Finalized reports of the book, newest cutoff first (the cutoff filter). */
  cutoffs: { id: string; label: string }[];
  report: SaaoReportRow | null;
  rows: ReportRow[];
  cutoffMonth: number;
  cutoffLabel: string;
  rules: { allotmentMode: AllotmentMode; movementRule: MovementRule; ruleClasses: Record<string, string> };
  movements: CountedMovement[];
  finalizedBy: string | null;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const CURRENT_CLASSES = Object.fromEntries(RULES.map((r) => [r.id, r.klass]));

export async function loadView(sp: ViewParams): Promise<LoadedView> {
  const { role } = await requireSaao("viewer");
  const canPreview = atLeast(role, "encoder");
  // ?preview=draft is honoured for encoder+ only; anyone else silently gets the finalized view
  const preview = canPreview && one(sp.preview) === "draft";
  const books = await listBooks();
  const bookParam = one(sp.book);
  const bookId = bookParam && books.some((b) => b.id === bookParam) ? bookParam : await getSelectedBookId(books);
  const b = books.find((x) => x.id === bookId) ?? null;
  const base: LoadedView = {
    role, canPreview, preview, book: null, cutoffs: [], report: null, rows: [], cutoffMonth: 12, cutoffLabel: "",
    rules: { allotmentMode: "equals_adjusted", movementRule: "all_entered", ruleClasses: CURRENT_CLASSES },
    movements: [], finalizedBy: null,
  };
  if (!b) return base;
  const book = { id: b.id, title: b.title, fiscalYear: b.fiscal_year, fundName: b.fund?.name ?? "" };

  const reports = await listReports(b.id);
  const finalized = reports.filter((r) => r.status === "finalized");
  const cutoffs = finalized.map((r) => {
    const m = Number(r.cutoff_date.slice(5, 7));
    return { id: r.id, label: `${monthEndLabel(Number(r.cutoff_date.slice(0, 4)), m)}${r.version > 1 ? ` (v${r.version})` : ""}` };
  });

  let report: SaaoReportRow | null;
  if (preview) {
    report = reports.filter((r) => r.status === "draft").sort((x, y) => y.cutoff_date.localeCompare(x.cutoff_date))[0] ?? null;
  } else {
    const wanted = one(sp.report);
    report = finalized.find((r) => r.id === wanted) ?? finalized.find((r) => r.id === pickDefaultReport(reports)) ?? null;
  }
  if (!report) return { ...base, book, cutoffs };

  const cutoffMonth = Number(report.cutoff_date.slice(5, 7));
  const cutoffLabel = monthEndLabel(Number(report.cutoff_date.slice(0, 4)), cutoffMonth);
  if (preview) {
    const rules = { allotmentMode: b.allotment_mode as AllotmentMode, movementRule: b.movement_rule as MovementRule, ruleClasses: CURRENT_CLASSES };
    const [rows, movements] = await Promise.all([
      getLiveRows(b.id, report.cutoff_date),
      listCountedMovements(b.id, report.cutoff_date, rules.movementRule),
    ]);
    return { ...base, book, cutoffs, report, rows, cutoffMonth, cutoffLabel, rules, movements };
  }

  // finalized: everything comes from the frozen snapshot, rules and movement list
  const frozen = asObj(report.rules);
  const header = asObj(report.header);
  const rules = {
    allotmentMode: frozen.allotment_mode as AllotmentMode,
    movementRule: frozen.movement_rule as MovementRule,
    ruleClasses: { ...CURRENT_CLASSES, ...(asObj(frozen.rule_classes) as Record<string, string>) },
  };
  const movements = (Array.isArray(report.movements) ? report.movements : []).map((raw) => {
    const m = asObj(raw);
    return {
      id: String(m.id), reference_no: (m.reference_no as string | null) ?? null, kind: String(m.kind ?? ""),
      sb_number: (m.sb_number as number | null) ?? null, title: (m.title as string | null) ?? null,
      effective_date: String(m.effective_date ?? ""), status: String(m.status ?? ""), status_note: (m.status_note as string | null) ?? null,
      total: fromNumeric((m.total as string | number | null) ?? 0),
    };
  });
  const supabase = await createClient();
  const [rows, who] = await Promise.all([
    getReportRows(report.id),
    report.finalized_by ? supabase.from("profiles").select("full_name").eq("id", report.finalized_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const frozenBook = {
    ...book,
    fiscalYear: Number(header.fiscal_year ?? book.fiscalYear),
    fundName: String(header.fund_name ?? "") || book.fundName,
  };
  return {
    ...base, book: frozenBook, cutoffs, report, rows, cutoffMonth, cutoffLabel, rules, movements,
    finalizedBy: (who.data as { full_name: string } | null)?.full_name ?? null,
  };
}

/** Section seq from ?section=, when it names a top-level row of `rows`. */
export function sectionParam(sp: ViewParams, rows: ReportRow[]): number | undefined {
  const raw = one(sp.section);
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const seq = Number(raw);
  return rows.some((r) => r.seq === seq && r.depth === 0 && r.kind !== "note") ? seq : undefined;
}
