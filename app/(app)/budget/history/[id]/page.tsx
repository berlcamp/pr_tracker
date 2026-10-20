import Link from "next/link";
import { notFound } from "next/navigation";
import { atLeast, requireSaao } from "@/lib/saao/access";
import { getLiveRows, getReport, getReportRows, listBooks, listReports } from "@/lib/saao/queries";
import { rollup } from "@/lib/saao/rollup";
import type { AllotmentMode, MovementRule } from "@/lib/saao/types";
import { BasisNote, type FrozenMovement } from "@/components/saao/basis-note";
import { resolveLabels, saaoColumns, sbNumbersOf } from "@/components/saao/columns";
import { ReportHeader } from "@/components/saao/report-header";
import { SaaoTable } from "@/components/saao/saao-table";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string | string[] }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export default async function ReportViewPage({ params, searchParams }: Props) {
  const { role } = await requireSaao("viewer");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const report = await getReport(id);
  if (!report) notFound();
  const isDraft = report.status === "draft";
  if (isDraft && !atLeast(role, "encoder")) notFound();
  const book = (await listBooks()).find((b) => b.id === report.book_id);
  if (!book) notFound();

  const frozen = !isDraft;
  const rulesJson = asObj(report.rules);
  const headerJson = asObj(report.header);
  const rows = frozen ? await getReportRows(id) : await getLiveRows(report.book_id, report.cutoff_date);

  const labels = resolveLabels(frozen ? rulesJson.extra_labels : book.extra_labels);
  const rawLines = frozen ? headerJson.header_lines : book.header_lines;
  const headerLines = Array.isArray(rawLines) ? rawLines.map(String) : [];
  const rules = frozen
    ? { allotmentMode: rulesJson.allotment_mode as AllotmentMode, movementRule: rulesJson.movement_rule as MovementRule }
    : { allotmentMode: book.allotment_mode as AllotmentMode, movementRule: book.movement_rule as MovementRule };

  const ackIds = new Set(Array.isArray(report.acknowledged_unapproved) ? (report.acknowledged_unapproved as string[]) : []);
  const movements = (Array.isArray(report.movements) ? report.movements : []) as FrozenMovement[];
  const acknowledged = movements.filter((m) => ackIds.has(m.id));

  let supersededByVersion: number | null = null;
  if (report.status === "superseded") {
    const siblings = await listReports(report.book_id);
    supersededByVersion = siblings.find((r) => r.revision_of === report.id)?.version ?? null;
  }

  const sectionRaw = Array.isArray(sp.section) ? sp.section[0] : sp.section;
  const sectionSeq = sectionRaw !== undefined && /^\d+$/.test(sectionRaw) ? Number(sectionRaw) : undefined;
  const display = rollup(rows, { sectionSeq });
  const columns = saaoColumns(sbNumbersOf(rows), labels);
  const cutoffLabel = new Date(`${report.cutoff_date}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const fundName = frozen ? String(headerJson.fund_name ?? "") : "";

  return (
    <div className="space-y-4">
      <Link href="/budget/history" className="text-sm text-muted-foreground underline">&larr; Report History</Link>
      {isDraft && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          DRAFT — not official. Figures change as data is entered.
        </div>
      )}
      <ReportHeader data={{
        headerLines, fundName: fundName || book.fund?.name || book.title, fiscalYear: frozen ? Number(headerJson.fiscal_year ?? book.fiscal_year) : book.fiscal_year,
        status: report.status as "draft" | "finalized" | "superseded", version: report.version, supersededByVersion, cutoffLabel,
      }} />
      {sectionSeq !== undefined && (
        <p className="text-sm">Showing one section. <Link className="underline" href={`/budget/history/${id}`}>Show full report</Link></p>
      )}
      <SaaoTable rows={display} columns={columns} />
      <BasisNote rules={rules} acknowledged={acknowledged} />
    </div>
  );
}
