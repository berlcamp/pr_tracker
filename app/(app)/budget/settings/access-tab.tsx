"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import type { SaaoRole } from "@/lib/saao/types";
import { setAccess } from "../actions";

export type AccessRow = { profileId: string; name: string; email: string; office: string; role: SaaoRole | null };

const ROLES: { value: SaaoRole | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "viewer", label: "Viewer" },
  { value: "encoder", label: "Encoder" },
  { value: "finalizer", label: "Finalizer" },
  { value: "budget_admin", label: "Budget admin" },
];

function RoleSelect({ row }: { row: AccessRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(v: string) {
    setBusy(true);
    const res = await setAccess({ profileId: row.profileId, role: v === "none" ? null : (v as SaaoRole) });
    setBusy(false);
    if (res.ok) toast.success("Access updated");
    else toast.error(res.error);
    router.refresh();
  }
  return (
    <Select value={row.role ?? "none"} onValueChange={change} disabled={busy}>
      <SelectTrigger aria-label={`Budget role for ${row.name}`} className="w-40"><SelectValue /></SelectTrigger>
      <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function AccessTab({ rows }: { rows: AccessRow[] }) {
  const columns: ColumnDef<AccessRow>[] = [
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Name" /> },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "office", header: "Office" },
    { id: "role", header: "Budget role", enableSorting: false, cell: ({ row }) => <RoleSelect row={row.original} /> },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Active users and their budget role. Users with no role do not see the Budget menu.</p>
      <DataTable columns={columns} data={rows} searchPlaceholder="Search users…" />
    </div>
  );
}
