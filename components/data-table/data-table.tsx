"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ServerMode = { rowCount: number; pageIndex: number; pageSize: number };

type Props<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  getRowClassName?: (row: TData) => string | undefined;
  server?: ServerMode;
  toolbar?: React.ReactNode;
};

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = "Search…", emptyMessage = "No records.", getRowClassName, server, toolbar,
}: Props<TData, TValue>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const initialSort = params.get("sort")?.split(".");
  const [sorting, setSorting] = useState<SortingState>(
    server && initialSort?.[0] ? [{ id: initialSort[0], desc: initialSort[1] !== "asc" }] : [],
  );
  const [globalFilter, setGlobalFilter] = useState(server ? params.get("q") ?? "" : "");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  function pushParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  // Server mode: debounce search into the URL.
  useEffect(() => {
    if (!server) return;
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== globalFilter) pushParams({ q: globalFilter || null, page: null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting, globalFilter, columnVisibility,
      ...(server ? { pagination: { pageIndex: server.pageIndex, pageSize: server.pageSize } } : {}),
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      if (server) pushParams({ sort: next[0] ? `${next[0].id}.${next[0].desc ? "desc" : "asc"}` : null, page: null });
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    ...(server
      ? { manualPagination: true, manualSorting: true, manualFiltering: true, rowCount: server.rowCount }
      : { getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel() }),
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = Math.max(1, table.getPageCount());
  const go = (index: number) => (server ? pushParams({ page: String(index + 1) }) : table.setPageIndex(index));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={searchPlaceholder} value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-9 w-full sm:w-64" />
        {toolbar}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-9"><Settings2 className="mr-2 size-4" />Columns</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllColumns().filter((c) => c.getCanHide()).map((c) => (
              <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} className="capitalize">
                {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id.replaceAll("_", " ")}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={getRowClassName?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className="h-20 text-center text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{server ? server.rowCount : table.getFilteredRowModel().rows.length} record(s)</span>
        <div className="flex items-center gap-2">
          <span>Page {pageIndex + 1} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => go(pageIndex - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={pageIndex + 1 >= pageCount} onClick={() => go(pageIndex + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
