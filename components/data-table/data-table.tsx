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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ServerMode = { rowCount: number; pageIndex: number; pageSize: number };

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Applied to both the header and body cells, e.g. responsive `hidden lg:table-cell`. */
    className?: string;
  }
}

const PAGE_SIZES = [10, 25, 50, 100];

type Props<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  getRowClassName?: (row: TData) => string | undefined;
  server?: ServerMode;
  toolbar?: React.ReactNode;
  /** Rendered on its own row under the search/toolbar row. */
  subToolbar?: React.ReactNode;
  searchClassName?: string;
  columnToggle?: boolean;
};

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = "Search…", emptyMessage = "No records.", getRowClassName, server, toolbar, subToolbar,
  searchClassName = "w-full sm:w-64", columnToggle = true,
}: Props<TData, TValue>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Server mode reads sorting straight from the URL so other controls (e.g. a sort menu) stay in sync.
  const urlSort = params.get("sort")?.split(".");
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const sorting: SortingState = server
    ? (urlSort?.[0] ? [{ id: urlSort[0], desc: urlSort[1] !== "asc" }] : [])
    : localSorting;
  const [globalFilter, setGlobalFilter] = useState(server ? params.get("q") ?? "" : "");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  function pushParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  // Server mode: debounce search into the URL.
  useEffect(() => {
    if (!server) return;
    const t = setTimeout(() => {
      if ((new URLSearchParams(window.location.search).get("q") ?? "") !== globalFilter) pushParams({ q: globalFilter || null, page: null });
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
      if (!server) setLocalSorting(next);
      else pushParams({ sort: next[0] ? `${next[0].id}.${next[0].desc ? "desc" : "asc"}` : null, page: null });
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
        <Input type="search" aria-label="Search" placeholder={searchPlaceholder} value={globalFilter}
               onChange={(e) => setGlobalFilter(e.target.value)} className={cn("h-9", searchClassName)} />
        {toolbar}
        {columnToggle && <DropdownMenu>
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
        </DropdownMenu>}
      </div>
      {subToolbar}
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={h.column.columnDef.meta?.className}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={getRowClassName?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="h-20 text-center text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{server ? server.rowCount : table.getFilteredRowModel().rows.length} record(s)</span>
        <div className="flex flex-wrap items-center gap-2">
          {server && (
            <Select value={String(server.pageSize)} onValueChange={(v) => pushParams({ size: v === "25" ? null : v, page: null })}>
              <SelectTrigger className="h-8 w-auto" aria-label="Rows per page"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
            </Select>
          )}
          <span>Page {pageIndex + 1} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => go(pageIndex - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={pageIndex + 1 >= pageCount} onClick={() => go(pageIndex + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
