"use client";
import { useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { MovementBadge } from "@/components/pr/movement-badge";
import { RsLink } from "@/components/pr/rs-link";
import { formatDate, formatDaysHere, formatPeso } from "@/lib/format";
import type { MovementState } from "@/lib/types";
import type { PrOverviewRow } from "@/lib/supabase/rows";
import { PrListFilters } from "./pr-list-filters";

export function PrListTable({ rows, rowCount, pageIndex, pageSize, offices }: {
  rows: PrOverviewRow[]; rowCount: number; pageIndex: number; pageSize: number; offices: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  const columns: ColumnDef<PrOverviewRow>[] = [
    { id: "select", enableHiding: false, header: "", cell: ({ row }) => (
      <Checkbox aria-label={`Select ${row.original.routing_slip_no}`} checked={selected.includes(row.original.id!)}
                onCheckedChange={(v) => toggle(row.original.id!, !!v)} />) },
    { accessorKey: "routing_slip_no", header: ({ column }) => <DataTableColumnHeader column={column} title="Routing Slip" />,
      cell: ({ row }) => <RsLink id={row.original.id!} rs={row.original.routing_slip_no!} /> },
    { accessorKey: "pr_no", header: ({ column }) => <DataTableColumnHeader column={column} title="PR No." />, cell: ({ row }) => row.original.pr_no ?? "—" },
    { accessorKey: "pr_date", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />, cell: ({ row }) => formatDate(row.original.pr_date!) },
    { accessorKey: "purpose", header: "Purpose", enableSorting: false, cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.purpose}</span> },
    { accessorKey: "origin_office_name", header: "Origin", enableSorting: false },
    { accessorKey: "current_office_name", header: "Current office", enableSorting: false },
    { accessorKey: "movement_state", header: "State", enableSorting: false, cell: ({ row }) => <MovementBadge state={row.original.movement_state as MovementState} /> },
    { accessorKey: "current_status_label", header: "Status", enableSorting: false, cell: ({ row }) => row.original.current_status_label ?? "—" },
    { accessorKey: "days_here", header: ({ column }) => <DataTableColumnHeader column={column} title="Days here" />, cell: ({ row }) => formatDaysHere(Number(row.original.days_here)) },
    { accessorKey: "amount", header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />, cell: ({ row }) => <span className="tabular-nums">{formatPeso(Number(row.original.amount))}</span> },
  ];

  return (
    <DataTable
      columns={columns} data={rows} searchPlaceholder="Search RS No., PR No., purpose…" emptyMessage="No purchase requests found."
      server={{ rowCount, pageIndex, pageSize }}
      toolbar={
        <>
          <PrListFilters offices={offices} />
          <Button asChild variant="outline" size="sm" className="h-9" aria-disabled={selected.length === 0}>
            <Link href={selected.length ? `/print/slips?layout=4up&ids=${selected.join(",")}` : "#"} target="_blank"
                  onClick={(e) => selected.length === 0 && e.preventDefault()}>
              <Printer className="mr-2 size-4" />Print selected slips ({selected.length})
            </Link>
          </Button>
        </>
      }
    />
  );
}
