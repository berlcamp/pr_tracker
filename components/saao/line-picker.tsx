"use client";
// Searchable popover for picking an account line of the book: "Section › … › Description (code)".
// Books have ~1,000 lines, so the list filters as you type and renders at most 50 matches (filterLines).
import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterLines, type LineOption } from "@/lib/saao/line-options";
import { cn } from "@/lib/utils";

export function LinePicker({ options, onSelect, disabledIds, trigger, disabledReason = "Already added" }: {
  options: LineOption[];
  onSelect: (option: LineOption) => void;
  /** Lines that cannot be picked (e.g. already on the movement). */
  disabledIds?: Set<string>;
  trigger: ReactNode;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const { shown, total } = useMemo(() => filterLines(options, query), [options, query]);

  function pick(o: LineOption | undefined) {
    if (!o || disabledIds?.has(o.id)) return;
    onSelect(o);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[hi]); }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setQuery(""); setHi(0); } }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[36rem] max-w-[calc(100vw-2rem)] p-2">
        <Input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setHi(0); }} onKeyDown={onKeyDown}
          placeholder="Search description, section or code…" aria-label="Search lines" className="h-8" />
        <ul role="listbox" aria-label="Lines" className="max-h-80 overflow-y-auto">
          {shown.map((o, i) => {
            const disabled = disabledIds?.has(o.id) ?? false;
            return (
              <li key={o.id} role="option" aria-selected={i === hi} aria-disabled={disabled || undefined}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                className={cn("cursor-pointer rounded px-2 py-1 text-xs", i === hi && "bg-muted", disabled && "cursor-not-allowed opacity-50")}>
                {o.path}{disabled && <span className="ml-1 text-muted-foreground">· {disabledReason}</span>}
              </li>
            );
          })}
          {total === 0 && <li className="px-2 py-3 text-center text-xs text-muted-foreground">No lines match.</li>}
        </ul>
        {total > shown.length && (
          <p className="px-2 text-xs text-muted-foreground">Showing {shown.length} of {total} matches. Keep typing to narrow.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
