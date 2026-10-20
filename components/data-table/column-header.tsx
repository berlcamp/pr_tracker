"use client";
import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DataTableColumnHeader<TData, TValue>({ column, title, align = "start" }: {
  column: Column<TData, TValue>; title: string; align?: "start" | "end";
}) {
  if (!column.getCanSort()) return <span>{title}</span>;
  const dir = column.getIsSorted();
  return (
    <Button variant="ghost" size="sm" className={align === "end" ? "-mr-2 h-8" : "-ml-3 h-8"} onClick={() => column.toggleSorting(dir === "asc")}>
      {title}
      {dir === "asc" ? <ArrowUp className="ml-1 size-3.5" /> : dir === "desc" ? <ArrowDown className="ml-1 size-3.5" /> : <ChevronsUpDown className="ml-1 size-3.5 opacity-50" />}
    </Button>
  );
}
