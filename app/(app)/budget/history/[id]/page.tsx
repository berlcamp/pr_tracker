import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSaao } from "@/lib/saao/access";
import { loadReportView } from "@/lib/saao/report-view";
import { rollup } from "@/lib/saao/rollup";
import { BasisNote } from "@/components/saao/basis-note";
import { saaoColumns, sbNumbersOf } from "@/components/saao/columns";
import { ReportHeader } from "@/components/saao/report-header";
import { SaaoTable } from "@/components/saao/saao-table";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string | string[] }> };

export default async function ReportViewPage({ params, searchParams }: Props) {
  const { role } = await requireSaao("viewer");
  const { id } = await params;
  const sp = await searchParams;
  const v = await loadReportView(id, role);
  if (!v) notFound();
  const isDraft = v.status === "draft";

  const sectionRaw = Array.isArray(sp.section) ? sp.section[0] : sp.section;
  const sectionSeq = sectionRaw !== undefined && /^\d+$/.test(sectionRaw) ? Number(sectionRaw) : undefined;
  const display = rollup(v.rows, { sectionSeq });
  const columns = saaoColumns(sbNumbersOf(v.rows), v.labels);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/budget/history" className="text-sm text-muted-foreground underline">&larr; Report History</Link>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/print/saao/${id}`} target="_blank">Print</Link></Button>
          <Button asChild variant="outline" size="sm"><a href={`/budget/export/${id}`}>Export Excel</a></Button>
          <Button asChild variant="outline" size="sm"><a href={`/budget/export/${id}?sheet=ending-balance`}>Ending Balance (Excel)</a></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/print/saao/${id}?sheet=ending-balance`} target="_blank">Ending Balance (Print)</Link></Button>
        </div>
      </div>
      {isDraft && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
          DRAFT — not official. Figures change as data is entered.
        </div>
      )}
      <ReportHeader data={{
        headerLines: v.headerLines, fundName: v.fundName, fiscalYear: v.fiscalYear,
        status: v.status, version: v.version, supersededByVersion: v.supersededByVersion, cutoffLabel: v.cutoffLabel,
      }} />
      {sectionSeq !== undefined && (
        <p className="text-sm">Showing one section. <Link className="underline" href={`/budget/history/${id}`}>Show full report</Link></p>
      )}
      <SaaoTable rows={display} columns={columns} />
      <BasisNote rules={v.rules} acknowledged={v.acknowledged} />
    </div>
  );
}
