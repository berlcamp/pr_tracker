"use client";
// Section table (spec §8.2): sortable; clicking a row opens the read-only SAAO for that section.
// Doubles as the table view of the section charts.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatAmount, formatPct } from "@/lib/saao/money";
import { cn } from "@/lib/utils";

export type SectionTableRow = {
  seq: number; label: string; adjusted: number; allotment: number; obligation: number;
  balanceAppropriation: number; balanceAllotment: number; pct: number | null;
};

type Key = keyof Omit<SectionTableRow, "seq">;
const COLUMNS: { key: Key; label: string }[] = [
  { key: "label", label: "Section" },
  { key: "adjusted", label: "Adjusted" },
  { key: "allotment", label: "Allotment" },
  { key: "obligation", label: "Obligation" },
  { key: "balanceAppropriation", label: "Bal. Appropriation" },
  { key: "balanceAllotment", label: "Bal. Allotment" },
  { key: "pct", label: "Obligation %" },
];

export function SectionTable({ rows, total, reportId }: { rows: SectionTableRow[]; total: Omit<SectionTableRow, "seq" | "label">; reportId: string }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: Key | null; desc: boolean }>({ key: null, desc: false });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const k = sort.key;
    return [...rows].sort((a, b) => {
      const av = a[k], bv = b[k];
      // "—" (null %) always sorts last
      if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
      const c = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.desc ? -c : c;
    });
  }, [rows, sort]);
  const href = (seq: number) => `/budget/history/${reportId}?section=${seq}`;
  const cell = (r: Omit<SectionTableRow, "seq" | "label">, k: Exclude<Key, "label">) => (k === "pct" ? formatPct(r.pct) : formatAmount(r[k] as number));

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
                  className={cn("px-3 py-2 font-semibold whitespace-nowrap", c.key === "label" ? "text-left" : "text-right")}>
                  <button type="button" className="inline-flex items-center gap-1 hover:underline"
                    onClick={() => setSort(active ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.key !== "label" })}>
                    {c.label}
                    {active && (sort.desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.seq} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => router.push(href(r.seq))}>
              <td className="px-3 py-1.5">
                <Link href={href(r.seq)} className="hover:underline" onClick={(e) => e.stopPropagation()}>{r.label}</Link>
              </td>
              {COLUMNS.slice(1).map((c) => (
                <td key={c.key} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{cell(r, c.key as Exclude<Key, "label">)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="px-3 py-2">Total</td>
            {COLUMNS.slice(1).map((c) => (
              <td key={c.key} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{cell(total, c.key as Exclude<Key, "label">)}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
