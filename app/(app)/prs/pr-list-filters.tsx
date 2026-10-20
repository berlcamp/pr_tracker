"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, ListFilter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOVEMENT_LABELS, formatDate, formatPeso } from "@/lib/format";
import { cn } from "@/lib/utils";

type Office = { id: string; name: string };

/** Filters that live in the "More filters" panel (state has its own chips). */
const PANEL_KEYS = ["office", "origin", "from", "to", "min", "max"] as const;
type PanelKey = (typeof PANEL_KEYS)[number];

const SORTS: [string, string][] = [
  ["created_at.desc", "Newest first"],
  ["created_at.asc", "Oldest first"],
  ["pr_date.desc", "PR date: latest"],
  ["pr_date.asc", "PR date: earliest"],
  ["days_here.desc", "Longest at office"],
  ["days_here.asc", "Shortest at office"],
  ["amount.desc", "Amount: highest"],
  ["amount.asc", "Amount: lowest"],
  ["routing_slip_no.asc", "Routing slip: A–Z"],
  ["routing_slip_no.desc", "Routing slip: Z–A"],
];
const DEFAULT_SORT = "created_at.desc";

function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return { params, update };
}

/** Toolbar controls shown beside the search box: the filter panel and the sort menu. */
export function PrListFilters({ offices }: { offices: Office[] }) {
  const { params, update } = useUrlParams();
  const [open, setOpen] = useState(false);
  const read = () => Object.fromEntries(PANEL_KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<PanelKey, string>;
  const [draft, setDraft] = useState(read);
  const activeCount = new Set(PANEL_KEYS.filter((k) => params.get(k)).map((k) => (k === "to" ? "from" : k === "max" ? "min" : k))).size;
  const field = (k: PanelKey) => ({ value: draft[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value }) });
  const sort = params.get("sort") ?? DEFAULT_SORT;

  return (
    <>
      <Popover open={open} onOpenChange={(o) => { if (o) setDraft(read()); setOpen(o); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <ListFilter className="size-4" />Filters
            {activeCount > 0 && (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">{activeCount}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              update(Object.fromEntries(PANEL_KEYS.map((k) => [k, draft[k] || null])));
              setOpen(false);
            }}
          >
            <OfficeSelect label="Current office" anyLabel="Any office" offices={offices}
                          value={draft.office} onChange={(v) => setDraft({ ...draft, office: v })} />
            <OfficeSelect label="Origin office" anyLabel="Any office" offices={offices}
                          value={draft.origin} onChange={(v) => setDraft({ ...draft, origin: v })} />
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">PR date</legend>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" aria-label="From date" max={draft.to || undefined} {...field("from")} />
                <Input type="date" aria-label="To date" min={draft.from || undefined} {...field("to")} />
              </div>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Amount (₱)</legend>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" inputMode="decimal" min={0} step="any" aria-label="Minimum amount" placeholder="Min" {...field("min")} />
                <Input type="number" inputMode="decimal" min={0} step="any" aria-label="Maximum amount" placeholder="Max" {...field("max")} />
              </div>
            </fieldset>
            <div className="flex justify-between gap-2 border-t pt-3">
              <Button type="button" variant="ghost" size="sm"
                      onClick={() => setDraft(Object.fromEntries(PANEL_KEYS.map((k) => [k, ""])) as Record<PanelKey, string>)}>
                Reset
              </Button>
              <Button type="submit" size="sm">Apply filters</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      <Select value={sort} onValueChange={(v) => update({ sort: v === DEFAULT_SORT ? null : v })}>
        <SelectTrigger className="h-9 w-auto" aria-label="Sort by">
          <ArrowUpDown className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {SORTS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          {!SORTS.some(([v]) => v === sort) && <SelectItem value={sort}>Custom order</SelectItem>}
        </SelectContent>
      </Select>
    </>
  );
}

function OfficeSelect({ label, anyLabel, offices, value, onChange }: {
  label: string; anyLabel: string; offices: Office[]; value: string; onChange: (v: string) => void;
}) {
  const id = `f-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
        <SelectTrigger id={id} className="h-9 w-full" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{anyLabel}</SelectItem>
          {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Second toolbar row: one-tap state chips, then removable chips for every active panel filter. */
export function PrListFilterBar({ offices }: { offices: Office[] }) {
  const { params, update } = useUrlParams();
  const state = params.get("state") ?? "";
  const officeName = (id: string | null) => offices.find((o) => o.id === id)?.name ?? "Unknown office";

  const active: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (params.get("office")) active.push({ key: "office", label: `At: ${officeName(params.get("office"))}`, clear: { office: null } });
  if (params.get("origin")) active.push({ key: "origin", label: `From: ${officeName(params.get("origin"))}`, clear: { origin: null } });
  const from = params.get("from"), to = params.get("to");
  if (from || to) {
    const label = from && to ? `${formatDate(from)} – ${formatDate(to)}` : from ? `On/after ${formatDate(from)}` : `On/before ${formatDate(to!)}`;
    active.push({ key: "date", label: `PR date: ${label}`, clear: { from: null, to: null } });
  }
  const min = params.get("min"), max = params.get("max");
  if (min || max) {
    const peso = (s: string) => formatPeso(Number(s)).replace(/\.00$/, "");
    const label = min && max ? `${peso(min)} – ${peso(max)}` : min ? `≥ ${peso(min)}` : `≤ ${peso(max!)}`;
    active.push({ key: "amount", label: `Amount: ${label}`, clear: { min: null, max: null } });
  }

  const chips: [string, string][] = [["", "All"], ...Object.entries(MOVEMENT_LABELS)];
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Filter by state" className="flex flex-wrap gap-1.5">
        {chips.map(([value, label]) => {
          const on = state === value;
          return (
            <button key={value || "all"} type="button" aria-pressed={on} onClick={() => update({ state: value || null })}
                    className={cn(
                      "h-8 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}>
              {label}
            </button>
          );
        })}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((f) => (
            <span key={f.key} className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border bg-muted/60 pl-2.5 text-xs font-medium">
              <span className="truncate">{f.label}</span>
              <button type="button" onClick={() => update(f.clear)} aria-label={`Remove filter ${f.label}`}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <Button variant="link" size="sm" className="h-7 px-1 text-xs"
                  onClick={() => update(Object.fromEntries(PANEL_KEYS.map((k) => [k, null])))}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
