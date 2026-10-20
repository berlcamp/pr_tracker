"use client";
import { useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { MovementBadge } from "@/components/pr/movement-badge";
import { RsLink } from "@/components/pr/rs-link";
import { formatDate, formatDaysHere, formatPeso } from "@/lib/format";
import type { MovementState } from "@/lib/types";
import type { PrOverviewRow } from "@/lib/supabase/rows";
import { PrListFilterBar, PrListFilters } from "./pr-list-filters";

const sub = "text-xs text-muted-foreground";

export function PrListTable({ rows, rowCount, pageIndex, pageSize, offices }: {
  rows: PrOverviewRow[]; rowCount: number; pageIndex: number; pageSize: number; offices: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const pageIds = rows.map((r) => r.id!);
  const pageSelected = pageIds.filter((id) => selected.includes(id)).length;

  // Columns are stacked (two lines per cell) and the least important ones collapse into
  // their neighbours on narrow screens, so the table fits without horizontal scrolling.
  const columns: ColumnDef<PrOverviewRow>[] = [
    { id: "select", enableHiding: false, meta: { className: "w-8" },
      header: () => (
        <Checkbox aria-label="Select all on this page"
                  checked={pageSelected === 0 ? false : pageSelected === pageIds.length ? true : "indeterminate"}
                  onCheckedChange={(v) => setSelected((s) => (v ? [...new Set([...s, ...pageIds])] : s.filter((x) => !pageIds.includes(x))))} />
      ),
      cell: ({ row }) => (
        <Checkbox aria-label={`Select ${row.original.routing_slip_no}`} checked={selected.includes(row.original.id!)}
                  onCheckedChange={(v) => toggle(row.original.id!, !!v)} />) },
    { accessorKey: "routing_slip_no", header: ({ column }) => <DataTableColumnHeader column={column} title="Routing slip" />,
      meta: { className: "whitespace-normal" },
      cell: ({ row }) => (
        <div className="min-w-0 space-y-0.5 py-0.5">
          <div className="whitespace-nowrap"><RsLink id={row.original.id!} rs={row.original.routing_slip_no!} /></div>
          <div className={sub}>
            {row.original.pr_no ? <>PR {row.original.pr_no}</> : "No PR no."} · {formatDate(row.original.pr_date!)}
          </div>
          <p className="line-clamp-2 max-w-md text-sm lg:hidden">{row.original.purpose}</p>
          <div className="text-sm font-medium tabular-nums lg:hidden">{formatPeso(Number(row.original.amount))}</div>
        </div>
      ) },
    { accessorKey: "purpose", header: "Purpose", enableSorting: false,
      meta: { className: "hidden w-full min-w-48 whitespace-normal lg:table-cell" },
      cell: ({ row }) => (
        <div className="space-y-0.5 py-0.5">
          <p className="line-clamp-2">{row.original.purpose}</p>
          <div className={sub}>From {row.original.origin_office_name}</div>
        </div>
      ) },
    { accessorKey: "current_office_name", header: "Location", enableSorting: false,
      meta: { className: "min-w-36 whitespace-normal xl:min-w-52" },
      cell: ({ row }) => (
        <div className="space-y-1 py-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MovementBadge state={row.original.movement_state as MovementState} />
            <span className="font-medium">{row.original.current_office_name}</span>
          </div>
          <div className={sub}>
            {row.original.current_status_label ?? "No status yet"}
            <span className="xl:hidden"> · {formatDaysHere(Number(row.original.days_here))}</span>
          </div>
        </div>
      ) },
    { accessorKey: "days_here", meta: { className: "hidden text-right xl:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Days here" align="end" />,
      cell: ({ row }) => <span className="tabular-nums">{formatDaysHere(Number(row.original.days_here))}</span> },
    { accessorKey: "amount", meta: { className: "hidden text-right lg:table-cell" },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" align="end" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatPeso(Number(row.original.amount))}</span> },
  ];

  return (
    <DataTable
      columns={columns} data={rows} searchPlaceholder="Search RS No., PR No., purpose…" emptyMessage="No purchase requests match these filters."
      server={{ rowCount, pageIndex, pageSize }} columnToggle={false} searchClassName="w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm"
      toolbar={<PrListFilters offices={offices} />}
      subToolbar={
        <>
          <PrListFilterBar offices={offices} />
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
              <span className="font-medium">{selected.length} selected</span>
              <Button asChild size="sm" className="h-8">
                <Link href={`/print/slips?layout=4up&ids=${selected.join(",")}`} target="_blank">
                  <Printer className="size-4" />Print routing slips
                </Link>
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={() => setSelected([])}>
                <X className="size-4" />Clear selection
              </Button>
            </div>
          )}
        </>
      }
    />
  );
}
