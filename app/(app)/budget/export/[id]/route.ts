import { requireSaao } from "@/lib/saao/access";
import { endingBalanceMatrix } from "@/lib/saao/ending-balance";
import { basisLines } from "@/lib/saao/basis";
import { loadReportView } from "@/lib/saao/report-view";
import { rollup } from "@/lib/saao/rollup";
import { buildEndingBalanceWorkbook, buildSaaoWorkbook } from "@/lib/saao/xlsx";
import { saaoColumns, sbNumbersOf } from "@/components/saao/columns";

export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { role } = await requireSaao("viewer");
  const { id } = await ctx.params;
  const v = await loadReportView(id, role);
  if (!v) return new Response("Not found", { status: 404 });

  const sheet = new URL(request.url).searchParams.get("sheet") === "ending-balance" ? "ending-balance" : "saao";
  const header = {
    lines: v.headerLines,
    title: "STATUS OF APPROPRIATION, ALLOTMENT & OBLIGATION",
    fund: `${v.fundName} · FY ${v.fiscalYear}`,
    asOf: `As of ${v.cutoffLabel}`,
    status: v.status,
    version: v.version,
  };
  const wb = sheet === "ending-balance"
    ? buildEndingBalanceWorkbook(endingBalanceMatrix(v.rows), header)
    : buildSaaoWorkbook({
        header, rows: rollup(v.rows), columns: saaoColumns(sbNumbersOf(v.rows), v.labels),
        basis: basisLines(v.rules, v.acknowledged), certifier: v.certifier,
      });
  const buf = await wb.xlsx.writeBuffer();
  const prefix = sheet === "ending-balance" ? "Ending-Balance" : "SAAO";
  const code = (v.fundCode || "FUND").replace(/[^A-Za-z0-9_-]/g, "");
  const filename = `${prefix}-FY${v.fiscalYear}-${code}-${v.report.cutoff_date.slice(0, 7)}-v${v.version}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
