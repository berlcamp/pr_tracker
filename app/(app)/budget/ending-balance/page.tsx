import Link from "next/link";
import { endingBalanceMatrix } from "@/lib/saao/ending-balance";
import { formatAmount } from "@/lib/saao/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ViewFilters } from "../dashboard/filters";
import { loadView, type ViewParams } from "../dashboard/load";

type Props = { searchParams: Promise<ViewParams> };

// AWAITING BUDGET OFFICE (R15): the grouping and which balance this summary shows are unconfirmed (spec §8.6, §9).
export default async function EndingBalancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const v = await loadView(sp);
  const params = Object.fromEntries(Object.entries(sp).flatMap(([k, val]) => (typeof val === "string" ? [[k, val]] : [])));
  const banner = (
    <div role="note" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      Layout pending Budget Office confirmation — see open questions.
    </div>
  );

  if (!v.book) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Summary of Ending Balance</h1>
        <p className="text-sm text-muted-foreground">No budget book yet.</p>
      </div>
    );
  }
  if (!v.report) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Summary of Ending Balance</h1>
        {banner}
        <ViewFilters params={params} cutoffs={v.cutoffs} reportId={null} canPreview={v.canPreview} preview={v.preview} />
        <p className="rounded-md border p-6 text-center text-sm">
          {v.preview ? <>There is no draft report for {v.book.title}. <Link className="underline" href="/budget/saao">Create one in SAAO Reports.</Link></>
            : <>No finalized SAAO report for {v.book.title} yet.</>}
        </p>
      </div>
    );
  }

  const report = v.report;
  const m = endingBalanceMatrix(v.rows);
  const body = (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Summary of Ending Balance</h1>
          {v.preview ? <Badge className="bg-amber-100 text-amber-900">Draft preview</Badge>
            : <Badge className="bg-green-100 text-green-900">{report.version > 1 ? "Revised" : "Finalized"} v{report.version}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          FY {v.book.fiscalYear} · {v.book.fundName || v.book.title} · As of {v.cutoffLabel} · Balance of Allotment by section and classification
        </p>
        {banner}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><a href={`/budget/export/${report.id}?sheet=ending-balance`}>Export Excel</a></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/print/saao/${report.id}?sheet=ending-balance`} target="_blank">Print</Link></Button>
        </div>
        <ViewFilters params={params} cutoffs={v.cutoffs} reportId={report.id} canPreview={v.canPreview} preview={v.preview} />
      </header>
      <div className="max-h-[75vh] overflow-auto rounded-md border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-20 min-w-64 border-b bg-muted px-3 py-2 text-left font-semibold">Section</th>
              {m.classes.map((c) => (
                <th key={c.code} scope="col" className="sticky top-0 z-10 border-b bg-muted px-3 py-2 text-right font-semibold whitespace-nowrap" title={c.name}>
                  {c.code === "UNCLASSIFIED" ? c.name : c.code}
                </th>
              ))}
              <th scope="col" className="sticky top-0 z-10 border-b bg-muted px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {m.sections.map((s) => (
              <tr key={s.seq} className="hover:bg-muted/30">
                <th scope="row" className="sticky left-0 border-b bg-background px-3 py-1.5 text-left font-normal">
                  <Link className="hover:underline" href={`/budget/history/${report.id}?section=${s.seq}`}>{s.label}</Link>
                </th>
                {m.classes.map((c) => (
                  <td key={c.code} className="border-b px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {s.byClass[c.code] === undefined ? "" : formatAmount(s.byClass[c.code])}
                  </td>
                ))}
                <td className="border-b px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">{formatAmount(s.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <th scope="row" className="sticky left-0 border-t-2 bg-background px-3 py-2 text-left">GRAND TOTAL</th>
              {m.classes.map((c) => (
                <td key={c.code} className="border-t-2 px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatAmount(m.columnTotals[c.code] ?? 0)}</td>
              ))}
              <td className="border-t-2 px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatAmount(m.grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Computed from the same rows as the SAAO. Each line counts under its nearest classification; lines with none are Unclassified.
        The Summary of Ending Balance grouping is unconfirmed (R15).
      </p>
    </div>
  );

  if (!v.preview) return body;
  return (
    <div className="rounded-xl border-4 border-amber-400 bg-amber-50/40 p-4 dark:bg-amber-950/20">
      <p className="mb-4 rounded-md bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
        DRAFT PREVIEW — not official
      </p>
      {body}
    </div>
  );
}
