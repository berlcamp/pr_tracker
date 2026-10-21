import { formatAmount, formatPct } from "@/lib/saao/money";
import type { DisplayRow } from "@/lib/saao/rollup";
import { cn } from "@/lib/utils";
import type { SaaoColumn } from "./columns";

/** Read-only SAAO grid. Server-rendered plain markup (about 1,200 rows); totals come from rollup(). */
export function SaaoTable({ rows, columns, sectionFilter }: { rows: DisplayRow[]; columns: SaaoColumn[]; sectionFilter?: number }) {
  const shown = sectionFilter === undefined ? rows : rows.filter((r) => r.sectionSeq === sectionFilter);
  return (
    <div className="max-h-[75vh] overflow-auto rounded-md border">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-72 border-b bg-muted px-2 py-2 text-left font-semibold">Description</th>
            <th className="sticky top-0 z-20 border-b bg-muted px-2 py-2 text-left font-semibold whitespace-nowrap">Code</th>
            {columns.map((c) => (
              <th key={c.key} className="sticky top-0 z-20 border-b bg-muted px-2 py-2 text-right font-semibold whitespace-nowrap">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const emphasis = r.type === "grand" ? "font-bold border-t-2" : r.type === "subtotal" ? "font-semibold bg-muted/40" : "";
            const stickyBg = r.type === "node" ? "bg-background" : r.type === "subtotal" ? "bg-muted" : "bg-background";
            const heading = r.type === "node" && r.amounts === null;
            return (
              <tr key={r.key} className={cn("hover:bg-muted/30", emphasis, heading && "font-medium")}>
                <td className={cn("sticky left-0 z-10 border-b px-2 py-1", stickyBg)} style={{ paddingLeft: 8 + r.depth * 14 }}>
                  {r.label}
                </td>
                <td className="border-b px-2 py-1 whitespace-nowrap text-muted-foreground">{r.type === "node" ? (r.row.accountCode ?? "") : ""}</td>
                {columns.map((c) => (
                  <td key={c.key} className="border-b px-2 py-1 text-right tabular-nums whitespace-nowrap">
                    {r.amounts ? (c.key === "pct" ? formatPct(r.pct) : formatAmount(c.get(r.amounts))) : ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
