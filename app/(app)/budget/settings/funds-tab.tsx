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
import type { SaaoFundRow } from "@/lib/supabase/rows";
import { upsertFund } from "../actions";

function FundDialog({ fund, trigger }: { fund: SaaoFundRow | null; trigger: React.ReactNode }) {
  const initial = { code: fund?.code ?? "", name: fund?.name ?? "", active: fund?.active ?? true };
  const [v, setV] = useState(initial);
  return (
    <ConfirmActionDialog
      trigger={trigger} title={fund ? `Save changes to ${fund.code}?` : "Add fund?"}
      description={<p>Fund codes are upper-cased automatically.</p>}
      confirmLabel="Save fund" successMessage="Fund saved" canConfirm={!!v.code.trim() && !!v.name.trim()}
      onOpenChange={(o) => o && setV(initial)}
      onConfirm={() => upsertFund({ id: fund?.id ?? null, ...v })}
    >
      <Label htmlFor="f-code">Code</Label>
      <Input id="f-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
      <Label htmlFor="f-name">Name</Label>
      <Input id="f-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.active} onCheckedChange={(c) => setV({ ...v, active: !!c })} />Active</label>
    </ConfirmActionDialog>
  );
}

export function FundsTab({ funds }: { funds: SaaoFundRow[] }) {
  const columns: ColumnDef<SaaoFundRow>[] = [
    { accessorKey: "code", header: "Code" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "active", header: "Active", cell: ({ row }) => (row.original.active ? "Yes" : "No") },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => (
      <FundDialog fund={row.original} trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} />
    ) },
  ];
  return (
    <DataTable columns={columns} data={funds} searchPlaceholder="Search funds…"
      toolbar={<FundDialog fund={null} trigger={<Button size="sm" className="h-9"><Plus className="mr-2 size-4" />Add fund</Button>} />} />
  );
}
