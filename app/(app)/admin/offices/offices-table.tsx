"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import type { OfficeRow } from "@/lib/supabase/rows";
import { saveOffice, type OfficeInput } from "../actions";

const FLAGS: { key: keyof OfficeInput; label: string }[] = [
  { key: "is_processing_office", label: "Processing office" },
  { key: "can_assign_pr_no", label: "Can assign PR No." },
  { key: "can_set_mode_of_procurement", label: "Can set mode of procurement" },
  { key: "can_complete", label: "Can complete PRs" },
  { key: "active", label: "Active" },
];

function OfficeDialog({ office, trigger }: { office: OfficeRow | null; trigger: React.ReactNode }) {
  const blank: OfficeInput = { id: null, code: "", name: "", is_processing_office: false, can_assign_pr_no: false, can_set_mode_of_procurement: false, can_complete: false, active: true };
  const from = (o: OfficeRow): OfficeInput => ({ id: o.id, code: o.code, name: o.name, is_processing_office: o.is_processing_office,
    can_assign_pr_no: o.can_assign_pr_no, can_set_mode_of_procurement: o.can_set_mode_of_procurement, can_complete: o.can_complete, active: o.active });
  const [v, setV] = useState<OfficeInput>(office ? from(office) : blank);
  return (
    <ConfirmActionDialog
      trigger={trigger} title={office ? `Save changes to ${office.name}?` : "Add office?"}
      description="Permission flags take effect immediately for every user in this office."
      confirmLabel={office ? "Save office" : "Add office"} successMessage="Office saved"
      canConfirm={/^[A-Za-z0-9_]{2,20}$/.test(v.code) && v.name.trim().length > 0}
      onOpenChange={(o) => o && setV(office ? from(office) : blank)}
      onConfirm={() => saveOffice(v)}
    >
      <Label htmlFor="o-code">Code</Label>
      <Input id="o-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
      <Label htmlFor="o-name">Name</Label>
      <Input id="o-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      {FLAGS.map((f) => (
        <label key={f.key} className="flex items-center gap-2 text-sm">
          <Checkbox checked={v[f.key] as boolean} onCheckedChange={(c) => setV({ ...v, [f.key]: !!c })} />{f.label}
        </label>
      ))}
    </ConfirmActionDialog>
  );
}

export function OfficesTable({ offices }: { offices: OfficeRow[] }) {
  const yes = (b: boolean) => (b ? "Yes" : "—");
  const columns: ColumnDef<OfficeRow>[] = [
    { accessorKey: "code", header: ({ column }) => <DataTableColumnHeader column={column} title="Code" /> },
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Name" /> },
    { accessorKey: "is_processing_office", header: "Processing", cell: ({ row }) => yes(row.original.is_processing_office) },
    { accessorKey: "can_assign_pr_no", header: "PR No.", cell: ({ row }) => yes(row.original.can_assign_pr_no) },
    { accessorKey: "can_set_mode_of_procurement", header: "Mode", cell: ({ row }) => yes(row.original.can_set_mode_of_procurement) },
    { accessorKey: "can_complete", header: "Complete", cell: ({ row }) => yes(row.original.can_complete) },
    { accessorKey: "active", header: "Active", cell: ({ row }) => yes(row.original.active) },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => (
      <OfficeDialog office={row.original} trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} />) },
  ];
  return <DataTable columns={columns} data={offices} searchPlaceholder="Search offices…"
    toolbar={<OfficeDialog office={null} trigger={<Button size="sm" className="h-9"><Building2 className="mr-2 size-4" />Add office</Button>} />} />;
}
