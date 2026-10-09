import { formatDate, formatPeso } from "@/lib/format";
import { truncate, type SlipRow } from "@/lib/pr/routing-slip";

type SlipPr = { routing_slip_no: string; pr_no: string | null; origin_office_name: string; pr_date: string; purpose: string; amount: number };

export function RoutingSlip({ lguName, pr, qr, rows }: { lguName: string; pr: SlipPr; qr: string; rows: SlipRow[] }) {
  return (
    <section
      className="box-border flex h-[148.5mm] w-[105mm] flex-col overflow-hidden border border-dashed border-gray-300 p-[5mm] text-[7pt] leading-tight text-black"
      style={{ breakInside: "avoid" }}
    >
      <header className="flex gap-[3mm]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code" className="h-[22mm] w-[22mm]" />
        <div className="min-w-0 flex-1">
          <div className="uppercase">{lguName}</div>
          <div className="text-[8pt] font-bold">PURCHASE REQUEST ROUTING SLIP</div>
          <div className="font-mono text-[12pt] font-bold">{pr.routing_slip_no}</div>
          <div>PR No.: {pr.pr_no ?? "____________________"}</div>
        </div>
      </header>
      <dl className="mt-[2mm] grid grid-cols-2 gap-x-[3mm] gap-y-[0.5mm]">
        <div><dt className="inline font-semibold">Origin: </dt><dd className="inline">{pr.origin_office_name}</dd></div>
        <div><dt className="inline font-semibold">Date: </dt><dd className="inline">{formatDate(pr.pr_date)}</dd></div>
        <div className="col-span-2"><dt className="inline font-semibold">Purpose: </dt><dd className="inline">{truncate(pr.purpose, 110)}</dd></div>
        <div className="col-span-2"><dt className="inline font-semibold">Amount: </dt><dd className="inline">{formatPeso(pr.amount)}</dd></div>
      </dl>
      <table className="mt-[2mm] w-full table-fixed border-collapse">
        <thead>
          <tr className="text-left">
            <th className="w-[30%] border border-black px-[1mm]">Office / Purpose</th>
            <th className="w-[32%] border border-black px-[1mm]">Received by (signature over printed name)</th>
            <th className="w-[18%] border border-black px-[1mm]">Date/Time</th>
            <th className="w-[20%] border border-black px-[1mm]">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="h-[6.5mm] max-h-[6.5mm] align-top">
              <td className="h-[6.5mm] overflow-hidden border border-black px-[1mm]" title={r.purpose ? `${r.label}: ${r.purpose}` : undefined}>
                <div className="truncate whitespace-nowrap font-semibold">{r.label}</div>
                {r.purpose && <div className="truncate whitespace-nowrap text-[6pt]">{r.purpose}</div>}
              </td>
              <td className="border border-black" /><td className="border border-black" /><td className="border border-black" />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
