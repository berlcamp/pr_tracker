"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { SaaoClassificationRow } from "@/lib/supabase/rows";
import { upsertClassification } from "../actions";

function ClassificationDialog({ item, trigger }: { item: SaaoClassificationRow | null; trigger: React.ReactNode }) {
  const initial = { code: item?.code ?? "", name: item?.name ?? "", sortOrder: String(item?.sort_order ?? 0), active: item?.active ?? true };
  const [v, setV] = useState(initial);
  const sortOk = /^-?\d+$/.test(v.sortOrder.trim());
  return (
    <ConfirmActionDialog
      trigger={trigger} title={item ? `Save changes to ${item.code}?` : "Add classification?"}
      description={<p>Codes are 2 to 12 letters, digits or underscores, and are upper-cased automatically.</p>}
      confirmLabel="Save classification" successMessage="Classification saved"
      canConfirm={!!v.code.trim() && !!v.name.trim() && sortOk}
      onOpenChange={(o) => o && setV(initial)}
      onConfirm={() => upsertClassification({ id: item?.id ?? null, code: v.code, name: v.name, sortOrder: Number(v.sortOrder), active: v.active })}
    >
      <Label htmlFor="c-code">Code</Label>
      <Input id="c-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
      <Label htmlFor="c-name">Name</Label>
      <Input id="c-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Label htmlFor="c-sort">Sort order</Label>
      <Input id="c-sort" inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.active} onCheckedChange={(c) => setV({ ...v, active: !!c })} />Active</label>
    </ConfirmActionDialog>
  );
}

export function ClassificationsTab({ classifications }: { classifications: SaaoClassificationRow[] }) {
  const columns: ColumnDef<SaaoClassificationRow>[] = [
    { accessorKey: "code", header: "Code" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "sort_order", header: "Order" },
    { accessorKey: "active", header: "Active", cell: ({ row }) => (row.original.active ? "Yes" : "No") },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => (
      <ClassificationDialog item={row.original} trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} />
    ) },
  ];
  return (
    <DataTable columns={columns} data={classifications} searchPlaceholder="Search classifications…"
      toolbar={<ClassificationDialog item={null} trigger={<Button size="sm" className="h-9"><Plus className="mr-2 size-4" />Add classification</Button>} />} />
  );
}
