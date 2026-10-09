"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { MovementBadge } from "@/components/pr/movement-badge";
import { ReceiveButton } from "@/components/pr/receive-button";
import { RsLink } from "@/components/pr/rs-link";
import { formatDateTime, formatDaysHere, formatPeso, locationLine } from "@/lib/format";
import { describeEvent, type TimelineEvent } from "@/lib/pr/timeline";
import type { MovementState } from "@/lib/types";
import type { FollowedActivityRow, PrOverviewRow } from "@/lib/supabase/rows";

const rs: ColumnDef<PrOverviewRow> = {
  accessorKey: "routing_slip_no", header: ({ column }) => <DataTableColumnHeader column={column} title="Routing Slip" />,
  cell: ({ row }) => <RsLink id={row.original.id!} rs={row.original.routing_slip_no!} />,
};
const purpose: ColumnDef<PrOverviewRow> = {
  accessorKey: "purpose", header: "Purpose", cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.purpose}</span>,
};
const amount: ColumnDef<PrOverviewRow> = {
  accessorKey: "amount", header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
  cell: ({ row }) => <span className="tabular-nums">{formatPeso(Number(row.original.amount))}</span>,
};
const days = (title: string): ColumnDef<PrOverviewRow> => ({
  accessorKey: "days_here", header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ row }) => formatDaysHere(Number(row.original.days_here)),
});

export function IncomingTable({ rows, officeName }: { rows: PrOverviewRow[]; officeName: string }) {
  const columns: ColumnDef<PrOverviewRow>[] = [
    rs, purpose,
    { accessorKey: "sent_by_office_name", header: "From" },
    { accessorKey: "movement_state", header: "Type", cell: ({ row }) => <MovementBadge state={row.original.movement_state as MovementState} /> },
    { accessorKey: "current_purpose", header: "For", cell: ({ row }) => row.original.current_purpose ?? "—" },
    days("Waiting"),
    { id: "receive", header: "", enableHiding: false, cell: ({ row }) => (
      <ReceiveButton size="sm" prId={row.original.id!} routingSlipNo={row.original.routing_slip_no!} officeName={officeName} />) },
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="Nothing waiting to be received." />;
}

export function OnHandTable({ rows, threshold }: { rows: PrOverviewRow[]; threshold: number }) {
  const columns: ColumnDef<PrOverviewRow>[] = [
    rs, purpose,
    { accessorKey: "origin_office_name", header: "Origin" },
    { accessorKey: "current_status_label", header: "Status", cell: ({ row }) => row.original.current_status_label ?? "—" },
    amount, days("Days here"),
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="No PRs on hand."
    getRowClassName={(r) => (Number(r.days_here) >= threshold ? "bg-amber-50" : undefined)} />;
}

export function MyPrsTable({ rows }: { rows: PrOverviewRow[] }) {
  const columns: ColumnDef<PrOverviewRow>[] = [
    rs, purpose,
    { id: "where", header: "Where is it now", cell: ({ row }) => {
      const r = row.original;
      return locationLine({ movement_state: r.movement_state as MovementState, current_office_name: r.current_office_name!,
        current_status_label: r.current_status_label, current_purpose: r.current_purpose, current_since: r.current_since!,
        route_step: r.route_step!, total_steps: r.total_steps! });
    } },
    amount,
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="Your office has no open PRs." />;
}

export function FollowingTable({ rows }: { rows: FollowedActivityRow[] }) {
  const columns: ColumnDef<FollowedActivityRow>[] = [
    { accessorKey: "routing_slip_no", header: "Routing Slip", cell: ({ row }) => <RsLink id={row.original.pr_id!} rs={row.original.routing_slip_no!} /> },
    { id: "what", header: "Activity", cell: ({ row }) => describeEvent({
        ...(row.original as unknown as TimelineEvent), from_office_name: null, to_office_name: null, status_label: null,
        override_reason: null, remark: null, to_route_step: null, route_purpose: null, payload: {},
      }, 0) },
    { accessorKey: "actor_office_name", header: "Office" },
    { accessorKey: "created_at", header: "When", cell: ({ row }) => formatDateTime(row.original.created_at!) },
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="No recent activity on followed PRs." />;
}

export type StuckRow = { pr_id: string; routing_slip_no: string; origin_office_name: string; current_office_name: string;
  movement_state: string; days: number; can_view: boolean };

export function StuckTable({ rows }: { rows: StuckRow[] }) {
  const columns: ColumnDef<StuckRow>[] = [
    { accessorKey: "routing_slip_no", header: "Routing Slip", cell: ({ row }) => (
      <Link className="font-mono text-primary hover:underline" href={`/track/${row.original.routing_slip_no}`}>{row.original.routing_slip_no}</Link>) },
    { accessorKey: "origin_office_name", header: "Origin" },
    { accessorKey: "current_office_name", header: "Current office" },
    { accessorKey: "movement_state", header: "State", cell: ({ row }) => <MovementBadge state={row.original.movement_state as MovementState} /> },
    { accessorKey: "days", header: ({ column }) => <DataTableColumnHeader column={column} title="Days" /> },
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="No stuck PRs." />;
}
