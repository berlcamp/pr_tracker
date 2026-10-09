import { Card, CardContent } from "@/components/ui/card";
import { MovementBadge } from "./movement-badge";
import { formatDateTime, locationLine, MOVEMENT_LABELS } from "@/lib/format";
import type { EventType, MovementState } from "@/lib/types";

export type TrackingResult = {
  pr_id: string | null; can_view: boolean; routing_slip_no: string; pr_no: string | null;
  origin_office_name: string; current_office_name: string; movement_state: MovementState;
  current_status_label: string | null; current_purpose: string | null; current_since: string;
  route_step: number; total_steps: number;
  timeline: { event_type: EventType; from_office_name: string | null; to_office_name: string | null; created_at: string }[];
};

const EVENT_TEXT: Partial<Record<EventType, (e: TrackingResult["timeline"][number]) => string>> = {
  created: () => "Created",
  forwarded: (e) => `Forwarded to ${e.to_office_name}`,
  received: (e) => `Received by ${e.to_office_name}`,
  returned: (e) => `Returned to ${e.to_office_name}`,
  recalled: (e) => `Recalled by ${e.to_office_name}`,
  completed: () => MOVEMENT_LABELS.completed,
  cancelled: () => MOVEMENT_LABELS.cancelled,
};

export function TrackingView({ data }: { data: TrackingResult }) {
  return (
    <Card><CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-2xl font-semibold">{data.routing_slip_no}</div>
          <div className="text-sm text-muted-foreground">PR No.: {data.pr_no ?? "Not yet assigned"} · Origin: {data.origin_office_name}</div>
        </div>
        <MovementBadge state={data.movement_state} />
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium" data-testid="location-line">{locationLine(data)}</p>
      <p className="text-xs text-muted-foreground">Your office is not involved in this PR, so only its location is shown.</p>
      <ol className="space-y-2 border-l pl-4 text-sm">
        {data.timeline.slice().reverse().map((e, i) => (
          <li key={i}><span className="font-medium">{EVENT_TEXT[e.event_type]?.(e) ?? e.event_type}</span>
            <span className="text-muted-foreground"> · {formatDateTime(e.created_at)}</span></li>
        ))}
      </ol>
    </CardContent></Card>
  );
}
