"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { toCsv } from "@/lib/csv";

export type OfficeDaysRow = {
  office_id: string; office_code: string; office_name: string; prs_handled: number;
  avg_days: number | null; median_days: number | null; max_days: number | null; avg_transit_days: number | null;
};

const num = (v: number | null) => (v === null ? "—" : Number(v).toFixed(2));
const sortable = (key: keyof OfficeDaysRow, title: string): ColumnDef<OfficeDaysRow> => ({
  accessorKey: key, header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ row }) => (typeof row.original[key] === "number" || row.original[key] === null ? num(row.original[key] as number | null) : String(row.original[key])),
});

const CSV_COLUMNS = [
  { key: "office_code", header: "Office code" }, { key: "office_name", header: "Office" },
  { key: "prs_handled", header: "PRs handled" }, { key: "avg_days", header: "Average days held" },
  { key: "median_days", header: "Median days held" }, { key: "max_days", header: "Max days held" },
  { key: "avg_transit_days", header: "Average days in transit to office" },
];

export function OfficeDaysTable({ rows, canExport, from, to }: { rows: OfficeDaysRow[]; canExport: boolean; from: string; to: string }) {
  const columns: ColumnDef<OfficeDaysRow>[] = [
    { accessorKey: "office_name", header: ({ column }) => <DataTableColumnHeader column={column} title="Office" /> },
    { accessorKey: "prs_handled", header: ({ column }) => <DataTableColumnHeader column={column} title="PRs handled" /> },
    sortable("avg_days", "Avg days held"), sortable("median_days", "Median"), sortable("max_days", "Max"),
    sortable("avg_transit_days", "Avg transit days"),
  ];
  function exportCsv() {
    const blob = new Blob([toCsv(rows as unknown as Record<string, unknown>[], CSV_COLUMNS)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `average-days-per-office_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <DataTable columns={columns} data={rows} searchPlaceholder="Filter offices…" emptyMessage="No movement in this period."
      toolbar={canExport ? <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}><Download className="mr-2 size-4" />Export CSV</Button> : null} />
  );
}
