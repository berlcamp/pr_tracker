"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { OfficeStatusRow } from "@/lib/supabase/rows";
import { saveStatus, type StatusInput } from "../actions";

function StatusDialog({ officeId, officeName, status, trigger }: { officeId: string; officeName: string; status: OfficeStatusRow | null; trigger: React.ReactNode }) {
  const init: StatusInput = status
    ? { id: status.id, office_id: officeId, label: status.label, sort_order: status.sort_order, active: status.active }
    : { id: null, office_id: officeId, label: "", sort_order: 0, active: true };
  const [v, setV] = useState(init);
  return (
    <ConfirmActionDialog trigger={trigger}
      title={status ? `Save status "${status.label}"?` : `Add a status for ${officeName}?`}
      description="Statuses can be deactivated but not deleted, because past events refer to them."
      confirmLabel="Save status" successMessage="Status saved" canConfirm={v.label.trim().length > 0}
      onOpenChange={(o) => o && setV(init)} onConfirm={() => saveStatus(v)}>
      <Label htmlFor="s-label">Label</Label>
      <Input id="s-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
      <Label htmlFor="s-order">Sort order</Label>
      <Input id="s-order" type="number" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: Number(e.target.value) || 0 })} />
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.active} onCheckedChange={(c) => setV({ ...v, active: !!c })} />Active</label>
    </ConfirmActionDialog>
  );
}

export function StatusesTable({ offices, officeId, statuses }: { offices: { id: string; name: string }[]; officeId: string; statuses: OfficeStatusRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const officeName = offices.find((o) => o.id === officeId)?.name ?? "";
  const columns: ColumnDef<OfficeStatusRow>[] = [
    { accessorKey: "sort_order", header: "Order" },
    { accessorKey: "label", header: "Label" },
    { accessorKey: "active", header: "Active", cell: ({ row }) => (row.original.active ? "Yes" : "No") },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => (
      <StatusDialog officeId={officeId} officeName={officeName} status={row.original}
        trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} />) },
  ];
  return (
    <DataTable columns={columns} data={statuses} searchPlaceholder="Filter statuses…"
      toolbar={<>
        <Select value={officeId} onValueChange={(v) => router.replace(`${pathname}?office=${v}`)}>
          <SelectTrigger className="h-9 w-64" aria-label="Office"><SelectValue /></SelectTrigger>
          <SelectContent>{offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
        <StatusDialog officeId={officeId} officeName={officeName} status={null}
          trigger={<Button size="sm" className="h-9"><Plus className="mr-2 size-4" />Add status</Button>} />
      </>} />
  );
}
