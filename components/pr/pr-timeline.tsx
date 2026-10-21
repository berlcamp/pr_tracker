"use client";
import { useState } from "react";
import {
  Ban, Bell, CheckCircle2, FilePlus2, History, Inbox, ListChecks, Lock, MessageSquare, Paperclip, Pencil, Send, Undo2,
  type LucideIcon,
} from "lucide-react";
import { diffSnapshots, eventSummary, type EventKind, type Snapshot, type TimelineEvent } from "@/lib/pr/timeline";
import { formatDateTime } from "@/lib/format";
import type { TimelineRow } from "@/lib/supabase/rows";
import { cn } from "@/lib/utils";

const KIND: Record<EventKind, { icon: LucideIcon; tone: string }> = {
  create: { icon: FilePlus2, tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  move: { icon: Send, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  receive: { icon: Inbox, tone: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  return: { icon: Undo2, tone: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  status: { icon: ListChecks, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  comment: { icon: MessageSquare, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  file: { icon: Paperclip, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  complete: { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  cancel: { icon: Ban, tone: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  follow: { icon: Bell, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  meta: { icon: Pencil, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};
const ROUTING: EventKind[] = ["create", "move", "receive", "return", "status", "complete", "cancel"];

const TZ = "Asia/Manila";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-PH", { timeZone: TZ, timeStyle: "short" }).format(new Date(iso));

type Filter = "all" | "routing";

export function PrTimeline({ events, totalSteps }: { events: TimelineRow[]; totalSteps: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const items = events.map((e) => ({ row: e, ...eventSummary(e as unknown as TimelineEvent, totalSteps) }));
  const shown = filter === "all" ? items : items.filter((i) => ROUTING.includes(i.kind));

  const days: { key: string; label: string; items: typeof shown }[] = [];
  for (const i of shown) {
    const key = dayKey(i.row.created_at!);
    if (days.at(-1)?.key !== key) days.push({ key, label: dayLabel(i.row.created_at!), items: [] });
    days.at(-1)!.items.push(i);
  }
  const latestId = shown[0]?.row.id;

  return (
    <section aria-label="Timeline" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <History className="size-4 text-muted-foreground" aria-hidden />Timeline
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{shown.length}</span>
        </h2>
        <div role="group" aria-label="Filter timeline" className="flex rounded-lg bg-muted p-0.5 text-xs font-medium">
          {(["all", "routing"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                    className={cn("h-7 cursor-pointer rounded-md px-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f === "all" ? "All activity" : "Routing only"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet.</p>}
        {days.map((d) => (
          <div key={d.key}>
            <h3 className="sticky top-0 z-10 border-b bg-card/95 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">{d.label}</h3>
            <ol className="px-4 pt-4">
              {d.items.map((i, idx) => {
                const { icon: Icon, tone } = KIND[i.kind];
                const payload = (i.row.payload ?? {}) as { before?: Snapshot; after?: Snapshot };
                const diff = i.row.event_type === "edited" && payload.before && payload.after ? diffSnapshots(payload.before, payload.after) : [];
                const isLast = idx === d.items.length - 1;
                return (
                  <li key={i.row.id} className="relative flex gap-3 pb-5">
                    {!isLast && <span aria-hidden className="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border" />}
                    <span aria-hidden className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", tone)}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-snug font-medium text-foreground">{i.title}</p>
                        {i.row.id === latestId && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Latest</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {i.row.actor_name}{i.row.actor_office_name ? ` · ${i.row.actor_office_name}` : ""}{" · "}
                        <time dateTime={i.row.created_at!} title={formatDateTime(i.row.created_at!)}>{timeLabel(i.row.created_at!)}</time>
                        {i.row.is_private && <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle"><Lock className="size-3" aria-hidden />Private</span>}
                      </p>
                      {i.note && (
                        <blockquote className="mt-2 rounded-md border-l-2 border-border bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap">
                          <span className="font-medium text-muted-foreground">{i.note.label}: </span>{i.note.text}
                        </blockquote>
                      )}
                      {diff.length > 0 && (
                        <ul className="mt-2 space-y-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                          {diff.map((x) => <li key={x}>{x}</li>)}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
