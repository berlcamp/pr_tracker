import { describeEvent, diffSnapshots, type Snapshot, type TimelineEvent } from "@/lib/pr/timeline";
import { formatDateTime } from "@/lib/format";
import type { TimelineRow } from "@/lib/supabase/rows";

export function PrTimeline({ events, totalSteps }: { events: TimelineRow[]; totalSteps: number }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l pl-6">
      {events.map((e) => {
        const ev = e as unknown as TimelineEvent;
        const payload = (e.payload ?? {}) as { before?: Snapshot; after?: Snapshot };
        const diff = e.event_type === "edited" && payload.before && payload.after ? diffSnapshots(payload.before, payload.after) : [];
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[29px] top-1.5 size-3 rounded-full border-2 border-background bg-primary" />
            <div className="text-sm font-medium">{describeEvent(ev, totalSteps)}</div>
            <div className="text-xs text-muted-foreground">{e.actor_name}{e.actor_office_name ? ` · ${e.actor_office_name}` : ""} · {formatDateTime(e.created_at!)}</div>
            {e.event_type === "forwarded" && e.remark && <p className="mt-1 text-sm">Remark: {e.remark}</p>}
            {diff.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{diff.map((d) => <li key={d}>{d}</li>)}</ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
