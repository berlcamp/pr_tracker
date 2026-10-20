import { notFound } from "next/navigation";
import { requireSaao } from "@/lib/saao/access";
import { endingBalanceMatrix } from "@/lib/saao/ending-balance";
import { basisLines, reportStatusLines } from "@/lib/saao/basis";
import { formatAmount, formatPct } from "@/lib/saao/money";
import { loadReportView } from "@/lib/saao/report-view";
import { rollup } from "@/lib/saao/rollup";
import { saaoColumns, sbNumbersOf } from "@/components/saao/columns";
import { PrintToolbar } from "./print-toolbar";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ sheet?: string }> };

const CSS = `
@page { size: 13in 8.5in landscape; margin: 10mm; }
.saao-print { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #000; background: #fff; }
.saao-print table { width: 100%; border-collapse: collapse; }
.saao-print thead { display: table-header-group; }
.saao-print tr { break-inside: avoid; }
.saao-print th, .saao-print td { padding: 1px 3px; border-bottom: 0.5px solid #bbb; }
.saao-print th { border-bottom: 1px solid #000; background: #eee; }
.saao-print .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.saao-print .sub td { font-weight: 700; }
.saao-print .grand td { font-weight: 700; border-top: 2px solid #000; }
.saao-print .head td:first-child { font-weight: 600; }
.saao-watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 110pt; font-weight: 700;
  color: rgba(0,0,0,0.08); transform: rotate(-20deg); pointer-events: none; z-index: 0; }
`;

export default async function PrintSaaoPage({ params, searchParams }: Props) {
  const { role } = await requireSaao("viewer");
  const { id } = await params;
  const { sheet } = await searchParams;
  const v = await loadReportView(id, role);
  if (!v) notFound();
  const status = reportStatusLines(v);
  const ending = sheet === "ending-balance";
  const columns = saaoColumns(sbNumbersOf(v.rows), v.labels);
  const display = ending ? [] : rollup(v.rows);
  const m = ending ? endingBalanceMatrix(v.rows) : null;

  return (
    <div className="bg-white">
      <style>{CSS}</style>
      <PrintToolbar backHref={`/budget/history/${id}`} />
      <div className="saao-print p-3">
        {status.watermark && <div className="saao-watermark" aria-hidden>{status.watermark}</div>}
        <header style={{ textAlign: "center", marginBottom: 6 }}>
          {v.headerLines.map((l, i) => <div key={i}>{l}</div>)}
          <div style={{ fontWeight: 700, fontSize: "10pt" }}>{ending ? "SUMMARY OF ENDING BALANCE" : "STATUS OF APPROPRIATION, ALLOTMENT & OBLIGATION"}</div>
          <div>{v.fundName} · FY {v.fiscalYear}</div>
          <div>As of {v.cutoffLabel}</div>
          {status.finalized && <div>{status.finalized}</div>}
          {status.banner && <div style={{ fontWeight: 700 }}>{status.banner}</div>}
        </header>

        {m ? (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Section</th>
                {m.classes.map((c) => <th key={c.code} className="num">{c.code === "UNCLASSIFIED" ? c.name : c.code}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {m.sections.map((s) => (
                <tr key={s.seq}>
                  <td>{s.label}</td>
                  {m.classes.map((c) => <td key={c.code} className="num">{s.byClass[c.code] === undefined ? "" : formatAmount(s.byClass[c.code])}</td>)}
                  <td className="num">{formatAmount(s.total)}</td>
                </tr>
              ))}
              <tr className="grand">
                <td>GRAND TOTAL</td>
                {m.classes.map((c) => <td key={c.code} className="num">{formatAmount(m.columnTotals[c.code] ?? 0)}</td>)}
                <td className="num">{formatAmount(m.grand)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Description</th>
                <th style={{ textAlign: "left" }}>Code</th>
                {columns.map((c) => <th key={c.key} className="num">{c.header}</th>)}
              </tr>
            </thead>
            <tbody>
              {display.map((r) => (
                <tr key={r.key} className={r.type === "grand" ? "grand" : r.type === "subtotal" ? "sub" : r.amounts === null ? "head" : undefined}>
                  <td style={{ paddingLeft: 3 + r.depth * 8 }}>{r.label}</td>
                  <td>{r.type === "node" ? (r.row.accountCode ?? "") : ""}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="num">{r.amounts ? (c.key === "pct" ? formatPct(r.pct) : formatAmount(c.get(r.amounts))) : ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <section style={{ marginTop: 10, breakInside: "avoid" }}>
          <div style={{ fontWeight: 700 }}>Basis of figures</div>
          <ul style={{ margin: "2px 0 0 14px", listStyle: "disc" }}>
            {basisLines(v.rules, v.acknowledged).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>
        <section style={{ marginTop: 18, breakInside: "avoid" }}>
          <div style={{ fontWeight: 700 }}>Certified Correct:</div>
          <div style={{ height: 28 }} />
          <div style={{ fontWeight: 700 }}>{v.certifier.name ?? ""}</div>
          <div>{v.certifier.title ?? ""}</div>
        </section>
      </div>
    </div>
  );
}
