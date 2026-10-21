import type { MovementState } from "./types";

export const MOVEMENT_LABELS: Record<MovementState, string> = {
  draft: "Draft", in_transit: "In transit", received: "Received",
  returned: "Returned", completed: "Completed", cancelled: "Cancelled",
};

const TZ = "Asia/Manila";

export function daysBetween(fromIso: string, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function formatDaysHere(days: number): string {
  const d = Math.floor(days);
  if (d < 1) return "less than a day";
  return d === 1 ? "1 day" : `${d} days`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function formatPeso(n: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, dateStyle: "medium" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export type LocationInput = {
  movement_state: MovementState;
  current_office_name: string;
  current_status_label: string | null;
  current_purpose: string | null;
  current_since: string;
  route_step: number;
  total_steps: number;
};

export function locationLine(pr: LocationInput, now: Date = new Date()): string {
  const days = formatDaysHere(daysBetween(pr.current_since, now));
  switch (pr.movement_state) {
    case "draft":
      return `Draft at ${pr.current_office_name}`;
    case "in_transit":
      return pr.current_purpose
        ? `In transit → ${pr.current_office_name} · ${lcFirst(pr.current_purpose)} · step ${pr.route_step} of ${pr.total_steps}`
        : `In transit → ${pr.current_office_name}`;
    case "returned":
      return `Returned → ${pr.current_office_name} · ${days} waiting`;
    case "received":
      return [`Received at ${pr.current_office_name}`, pr.current_status_label, `${days} here`].filter(Boolean).join(" · ");
    case "completed":
      return `Completed at ${pr.current_office_name}`;
    case "cancelled":
      return "Cancelled";
  }
}
