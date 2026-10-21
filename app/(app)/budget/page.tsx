import Link from "next/link";
import type { ReactNode } from "react";
import { atLeast } from "@/lib/saao/access";
import { MONTHS } from "@/lib/saao/cutoff";
import { compactPeso, rowsOfSection, summaryCards, topSections } from "@/lib/saao/dashboard";
import { formatAmount, formatPct } from "@/lib/saao/money";
import { classificationTotals, monthlyTotals, sectionSummaries, totalAmounts } from "@/lib/saao/rollup";
import { Badge } from "@/components/ui/badge";
import { GroupedBarChart, HBarChart, MonthlyColumns, StackedBar, type SeriesColor } from "./dashboard/charts";
import { ViewFilters } from "./dashboard/filters";
import { loadView, sectionParam, type ViewParams } from "./dashboard/load";
import { SectionTable } from "./dashboard/section-table";
import { SummaryCards } from "./dashboard/summary-cards";

type Props = { searchParams: Promise<ViewParams> };

const CLASS_COLORS: Record<string, SeriesColor> = { PS: "s1", MOOE: "s2", CO: "s3" };
const EXTRA_COLORS: SeriesColor[] = ["s4", "s5", "s6", "s7"];
const peso = (c: number) => (c < 0 ? `-₱${formatAmount(-c)}` : `₱${formatAmount(c)}`);
const share = (part: number, whole: number) => (whole > 0 && part > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

function Panel({ title, description, children, wide }: { title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`min-w-0 space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${wide ? "lg:col-span-2" : ""}`}>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function BudgetDashboardPage({ searchParams }: Props) {
  const sp = await searchParams;
  const v = await loadView(sp);
  const params = Object.fromEntries(Object.entries(sp).flatMap(([k, val]) => (typeof val === "string" ? [[k, val]] : [])));

  if (!v.book) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Budget Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          No budget book yet.{" "}
          {atLeast(v.role, "budget_admin") && <Link className="underline" href="/budget/settings">Create the first book in Budget Settings.</Link>}
        </p>
      </div>
    );
  }

  if (!v.report) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Budget Dashboard</h1>
        <ViewFilters params={params} cutoffs={v.cutoffs} reportId={null} canPreview={v.canPreview} preview={v.preview} />
        {v.preview ? (
          <div className="rounded-md border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            There is no draft report for {v.book.title}. <Link className="underline" href="/budget/saao">Create one in SAAO Reports.</Link>
          </div>
        ) : (
          <div className="rounded-md border p-6 text-center text-sm">
            <p>No finalized SAAO report for {v.book.title} yet.</p>
            {v.canPreview && <p className="mt-2"><Link className="underline" href="/budget/saao">Open the SAAO workspace</Link></p>}
          </div>
        )}
      </div>
    );
  }

  const report = v.report;
  const sectionSeq = sectionParam(sp, v.rows);
  const scoped = sectionSeq === undefined ? v.rows : rowsOfSection(v.rows, sectionSeq);
  const sections = sectionSummaries(v.rows);
  const dim = (seq: number | null) => sectionSeq !== undefined && seq !== sectionSeq;
  const cards = summaryCards(scoped);
  const hideAllotment = v.rules.allotmentMode === "equals_adjusted"; // PROVISIONAL (R5)

  // chart 1: obligations by section, top 15 + Others
  const top = topSections(v.rows, 15).map((s) => ({
    key: String(s.seq ?? "others"), label: s.label, value: s.amounts.obligation, valueLabel: compactPeso(s.amounts.obligation), dim: dim(s.seq),
  }));
  // chart 2: adjusted vs (allotment) vs obligation by section
  const series = [
    { name: "Adjusted appropriation", color: "s3" as SeriesColor, get: (a: typeof sections[number]["amounts"]) => a.adjusted },
    ...(hideAllotment ? [] : [{ name: "Allotment", color: "s2" as SeriesColor, get: (a: typeof sections[number]["amounts"]) => a.allotment }]),
    { name: "Obligation", color: "s1" as SeriesColor, get: (a: typeof sections[number]["amounts"]) => a.obligation },
  ];
  const groups = [...sections].sort((a, b) => b.amounts.adjusted - a.amounts.adjusted).map((s) => ({
    key: String(s.seq), label: s.label, dim: dim(s.seq),
    values: series.map((x) => x.get(s.amounts)), valueLabels: series.map((x) => peso(x.get(s.amounts))),
  }));
  // chart 3: distribution by classification
  let extra = 0;
  const classes = classificationTotals(scoped).map((c) => ({
    ...c, color: c.code === "UNCLASSIFIED" ? ("s-other" as SeriesColor) : (CLASS_COLORS[c.code] ?? EXTRA_COLORS[extra++ % EXTRA_COLORS.length]),
  }));
  const posSum = (f: (a: (typeof classes)[number]["amounts"]) => number) => classes.reduce((t, c) => t + Math.max(0, f(c.amounts)), 0);
  const stackRows = [
    { key: "adjusted", label: "Adjusted appropriation", get: (a: (typeof classes)[number]["amounts"]) => a.adjusted },
    { key: "obligation", label: "Obligations", get: (a: (typeof classes)[number]["amounts"]) => a.obligation },
  ].map((r) => {
    const whole = posSum(r.get);
    return {
      key: r.key, label: r.label,
      segments: classes.map((c) => ({ key: c.code, label: c.name, value: r.get(c.amounts), valueLabel: peso(r.get(c.amounts)), share: share(r.get(c.amounts), whole), color: c.color })),
    };
  });
  // chart 4: monthly obligations Jan..cutoff
  const months = monthlyTotals(scoped).slice(0, v.cutoffMonth).map((value, i) => ({ label: MONTHS[i].slice(0, 3), value, valueLabel: peso(value) }));
  // chart 5: utilization by section, sorted ("—" last)
  const utilization = [...sections].sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity)).map((s) => ({
    key: String(s.seq), label: s.label, value: s.pct ?? 0, valueLabel: formatPct(s.pct), dim: dim(s.seq),
  }));

  const tableRows = (sectionSeq === undefined ? sections : sections.filter((s) => s.seq === sectionSeq)).map((s) => ({
    seq: s.seq, label: s.label, adjusted: s.amounts.adjusted, allotment: s.amounts.allotment, obligation: s.amounts.obligation,
    balanceAppropriation: s.amounts.balanceAppropriation, balanceAllotment: s.amounts.balanceAllotment, pct: s.pct,
  }));
  const t = totalAmounts(scoped.flatMap((r) => (r.kind === "line" && r.amounts ? [r.amounts] : [])));
  const pctCard = cards.find((c) => c.key === "pct")!;

  const status = v.preview
    ? <Badge className="bg-amber-100 text-amber-900">Draft preview</Badge>
    : <Badge className="bg-green-100 text-green-900">{report.version > 1 ? "Revised" : "Finalized"} v{report.version}</Badge>;
  const finalizedAt = report.finalized_at ? new Date(report.finalized_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : null;
  const sectionLabel = sectionSeq === undefined ? null : sections.find((s) => s.seq === sectionSeq)?.label;

  const body = (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">Budget Dashboard</h1>
          {status}
        </div>
        <p className="text-sm text-muted-foreground">
          FY {v.book.fiscalYear} · {v.book.fundName || v.book.title} · As of {v.cutoffLabel}
          {!v.preview && finalizedAt && <> · Finalized by {v.finalizedBy ?? "—"} on {finalizedAt}</>}
        </p>
        <ViewFilters params={params} cutoffs={v.cutoffs} reportId={report.id} sections={sections.map((s) => ({ seq: s.seq, label: s.label }))}
          sectionSeq={sectionSeq} canPreview={v.canPreview} preview={v.preview} />
        {sectionLabel && (
          <p className="text-sm">
            Showing {sectionLabel}. <Link className="underline" href={`/budget/history/${report.id}?section=${sectionSeq}`}>Open its full breakdown</Link>
          </p>
        )}
      </header>

      <SummaryCards cards={cards} ruleClasses={v.rules.ruleClasses} note={{
        R5: v.rules.allotmentMode === "equals_adjusted" ? "Allotment is taken as equal to the adjusted appropriation." : "Allotment is the sum of recorded allotment releases.",
        R7: "The workbook's formula; equal to adjusted less obligation only while R5 holds.",
      }} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Obligations by section" description={`Top 15 sections by obligations${sections.length > 15 ? "; the rest are summed in Others" : ""}.`}>
          <HBarChart bars={top} ariaLabel="Obligations by section" seriesLabel="Obligations" />
        </Panel>
        <Panel title="Distribution by classification" description={sectionLabel ? `Within ${sectionLabel}.` : "Share of each classification."}>
          <StackedBar rows={stackRows} ariaLabel="Adjusted appropriation and obligations by classification" />
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="py-1 text-left font-medium">Classification</th><th className="py-1 text-right font-medium">Adjusted</th><th className="py-1 text-right font-medium">Obligations</th></tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.code} className="border-t">
                  <td className="py-1">{c.name}</td>
                  <td className="py-1 text-right tabular-nums">{formatAmount(c.amounts.adjusted)} <span className="text-muted-foreground">({share(c.amounts.adjusted, posSum((a) => a.adjusted))})</span></td>
                  <td className="py-1 text-right tabular-nums">{formatAmount(c.amounts.obligation)} <span className="text-muted-foreground">({share(c.amounts.obligation, posSum((a) => a.obligation))})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>
        <Panel wide title="Adjusted appropriation vs obligations by section"
          description={hideAllotment ? "Allotment equals adjusted appropriation under the current provisional rule (R5)" : "Adjusted appropriation, allotment and obligations per section."}>
          <GroupedBarChart groups={groups} series={series.map(({ name, color }) => ({ name, color }))} ariaLabel="Adjusted appropriation and obligations by section" />
        </Panel>
        <Panel title="Monthly obligations" description={`January to ${MONTHS[v.cutoffMonth - 1]}${sectionLabel ? `, ${sectionLabel}` : ""}.`}>
          <MonthlyColumns months={months} ariaLabel="Monthly obligations" seriesLabel="Obligations" />
        </Panel>
        <Panel title="Budget movements in this report" description={`${v.preview ? "Movements the draft counts as of its cutoff" : "As frozen at finalization"}. Net is the sum of each movement’s lines.`}>
          {v.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No budget movements counted in this report.</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-medium">Reference</th><th className="py-1 text-left font-medium">Kind</th>
                    <th className="py-1 text-left font-medium">Status</th><th className="py-1 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {v.movements.map((m) => (
                    <tr key={m.id} className="border-t align-top">
                      <td className="py-1 pr-2">
                        {m.reference_no ?? "—"}{m.sb_number ? ` (SB-${m.sb_number})` : ""}
                        {m.title && <div className="text-muted-foreground">{m.title}</div>}
                      </td>
                      <td className="py-1 pr-2 capitalize">{m.kind.replace("_", " ")}</td>
                      <td className="py-1 pr-2 capitalize">{m.status}{m.status_note && <div className="text-muted-foreground normal-case">{m.status_note}</div>}</td>
                      <td className="py-1 text-right tabular-nums whitespace-nowrap">{formatAmount(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel wide title="Utilization by section" description={`Obligation % of adjusted appropriation, highest first (overall ${formatPct(pctCard.pct ?? null)}).`}>
          <HBarChart bars={utilization} ariaLabel="Obligation percentage by section" seriesLabel="Obligation %" />
        </Panel>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Sections</h2>
        <SectionTable rows={tableRows} reportId={report.id} total={{
          adjusted: t.adjusted, allotment: t.allotment, obligation: t.obligation,
          balanceAppropriation: t.balanceAppropriation, balanceAllotment: t.balanceAllotment, pct: pctCard.pct ?? null,
        }} />
      </section>
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
