import type { EventType } from "../types";

export type TimelineEvent = {
  event_type: EventType;
  actor_name: string;
  actor_office_name: string | null;
  from_office_name: string | null;
  to_office_name: string | null;
  status_label: string | null;
  override_reason: string | null;
  remark: string | null;
  to_route_step: number | null;
  route_purpose: string | null;
  payload: Record<string, unknown>;
};

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function describeEvent(e: TimelineEvent, totalSteps: number): string {
  const who = e.actor_office_name ? `${e.actor_name} (${e.actor_office_name})` : e.actor_name;
  switch (e.event_type) {
    case "created": return `Created by ${who}`;
    case "edited": return e.payload.before ? `Edited by ${who} after return` : `Edited by ${who}`;
    case "forwarded": {
      const base = e.route_purpose && e.to_route_step
        ? `Forwarded to ${e.to_office_name} ${lcFirst(e.route_purpose)} (step ${e.to_route_step} of ${totalSteps})`
        : `Forwarded to ${e.to_office_name} outside the default route`;
      return e.override_reason ? `${base}. Reason: ${e.override_reason}` : base;
    }
    case "received": return `Received by ${who}`;
    case "returned": return `Returned to ${e.to_office_name}. Reason: ${str(e.remark)}`;
    case "recalled": return `Recalled from ${e.from_office_name} by ${who}`;
    case "status_changed": return `Status set to "${str(e.status_label)}"`;
    case "remark_added": return `Remark: ${str(e.remark)}`;
    case "private_note_added": return "Private note added";
    case "attachment_added": return `Attached ${str(e.payload.filename)}`;
    case "attachment_superseded": return `Marked ${str(e.payload.filename)} as superseded. Reason: ${str(e.remark)}`;
    case "pr_document_uploaded":
      return e.payload.replaced_filename
        ? `PR document replaced: ${str(e.payload.replaced_filename)} → ${str(e.payload.filename)}`
        : `PR document uploaded (${str(e.payload.filename)})`;
    case "pr_no_assigned":
      return e.payload.old ? `PR No. changed from ${str(e.payload.old)} to ${str(e.payload.new)}` : `PR No. ${str(e.payload.new)} assigned`;
    case "mode_set": return `Mode of procurement set to ${str(e.payload.new)}`;
    case "completed": return "Completed";
    case "cancelled": return `Cancelled. Reason: ${str(e.remark)}`;
    case "followed": return `${e.actor_office_name ?? e.actor_name} followed this PR`;
    case "unfollowed": return `${e.actor_office_name ?? e.actor_name} unfollowed this PR`;
  }
}

export type Snapshot = { header: Record<string, unknown> };

const HEADER_LABELS: Record<string, string> = {
  pr_date: "Date", purpose: "Purpose", amount: "Amount", responsibility_center_code: "Responsibility center code",
  fund_cluster: "Fund cluster", requested_by_name: "Requested by", requested_by_designation: "Requested by designation",
};

export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  for (const key of Object.keys(HEADER_LABELS)) {
    const a = str(before.header[key]);
    const b = str(after.header[key]);
    if (a !== b) out.push(`${HEADER_LABELS[key]}: "${a}" → "${b}"`);
  }
  return out;
}

export type NotificationRow = { type: EventType; actor_office_name: string | null; routing_slip_no: string };

export function notificationText(n: NotificationRow): string {
  const who = n.actor_office_name ?? "An administrator";
  const rs = n.routing_slip_no;
  switch (n.type) {
    case "forwarded": return `${who} forwarded ${rs} to your office`;
    case "returned": return `${who} returned ${rs} to your office`;
    case "received": return `${who} received ${rs}`;
    case "recalled": return `${who} recalled ${rs}`;
    case "status_changed": return `${who} updated the status of ${rs}`;
    case "remark_added": return `${who} added a remark on ${rs}`;
    case "attachment_added": return `${who} attached a file to ${rs}`;
    case "pr_document_uploaded": return `${who} uploaded a new PR document for ${rs}`;
    case "completed": return `${rs} was completed`;
    case "cancelled": return `${rs} was cancelled`;
    default: return `${rs} was updated`;
  }
}
