"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { SaaoBookRow, SaaoFundRow } from "@/lib/supabase/rows";
import { createBook } from "../actions";

type BookListRow = SaaoBookRow & { fund: { code: string; name: string } | null };

function NewBookDialog({ books, funds }: { books: BookListRow[]; funds: SaaoFundRow[] }) {
  const activeFunds = funds.filter((f) => f.active);
  const initial = { year: String(new Date().getFullYear()), fundId: activeFunds[0]?.id ?? "", title: "", copyFrom: "none", copyAppropriations: false };
  const [v, setV] = useState(initial);
  const yearOk = /^\d{4}$/.test(v.year);
  return (
    <ConfirmActionDialog
      trigger={<Button size="sm" className="h-9"><Plus className="mr-2 size-4" />New book</Button>}
      title="Create book?"
      description={<p>A book holds the structure, movements, allotments and obligations of one fiscal year and fund. Copying brings over the row structure.</p>}
      confirmLabel="Create book" successMessage="Book created" canConfirm={yearOk && !!v.fundId && !!v.title.trim()}
      onOpenChange={(o) => o && setV(initial)}
      onConfirm={() => createBook({
        fiscalYear: Number(v.year), fundId: v.fundId, title: v.title,
        copyFrom: v.copyFrom === "none" ? null : v.copyFrom, copyAppropriations: v.copyFrom !== "none" && v.copyAppropriations,
      })}
    >
      <Label htmlFor="b-year">Fiscal year</Label>
      <Input id="b-year" inputMode="numeric" value={v.year} onChange={(e) => setV({ ...v, year: e.target.value })} />
      <Label>Fund</Label>
      <Select value={v.fundId} onValueChange={(x) => setV({ ...v, fundId: x })}>
        <SelectTrigger aria-label="Fund"><SelectValue /></SelectTrigger>
        <SelectContent>{activeFunds.map((f) => <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>)}</SelectContent>
      </Select>
      <Label htmlFor="b-title">Title</Label>
      <Input id="b-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <Label>Copy structure from</Label>
      <Select value={v.copyFrom} onValueChange={(x) => setV({ ...v, copyFrom: x })}>
        <SelectTrigger aria-label="Copy from"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Start empty</SelectItem>
          {books.map((b) => <SelectItem key={b.id} value={b.id}>FY {b.fiscal_year} {b.fund?.name ?? ""}</SelectItem>)}
        </SelectContent>
      </Select>
      {v.copyFrom !== "none" && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={v.copyAppropriations} onCheckedChange={(c) => setV({ ...v, copyAppropriations: !!c })} />Also copy appropriations
        </label>
      )}
    </ConfirmActionDialog>
  );
}

export function BooksTab({ books, funds }: { books: BookListRow[]; funds: SaaoFundRow[] }) {
  const columns: ColumnDef<BookListRow>[] = [
    { accessorKey: "fiscal_year", header: "Fiscal year" },
    { id: "fund", header: "Fund", accessorFn: (b) => b.fund?.name ?? "—" },
    { accessorKey: "title", header: "Title" },
    { id: "rules", header: "Rules", accessorFn: (b) => `${b.allotment_mode} / ${b.movement_rule}`, meta: { className: "hidden md:table-cell" } },
  ];
  return (
    <DataTable columns={columns} data={books} searchPlaceholder="Search books…" toolbar={<NewBookDialog books={books} funds={funds} />} />
  );
}
