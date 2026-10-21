import type { Database } from "./database.types";

type S = Database["pr_tracker"];
export type PrOverviewRow = S["Views"]["pr_overview"]["Row"];
export type TimelineRow = S["Views"]["pr_timeline"]["Row"];
export type NotificationViewRow = S["Functions"]["list_my_notifications"]["Returns"][number];
export type FollowedActivityRow = S["Views"]["followed_activity"]["Row"];
export type AttachmentRow = S["Tables"]["pr_attachments"]["Row"];
export type OfficeRow = S["Tables"]["offices"]["Row"];
export type ProfileRow = S["Tables"]["profiles"]["Row"];
export type OfficeStatusRow = S["Tables"]["office_statuses"]["Row"];
export type RouteStepRow = S["Tables"]["default_route_steps"]["Row"];
