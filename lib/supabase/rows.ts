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

export type SaaoFundRow = S["Tables"]["saao_funds"]["Row"];
export type SaaoClassificationRow = S["Tables"]["saao_classifications"]["Row"];
export type SaaoBookRow = S["Tables"]["saao_books"]["Row"];
export type SaaoNodeRow = S["Tables"]["saao_nodes"]["Row"];
export type SaaoMovementRow = S["Tables"]["saao_movements"]["Row"];
export type SaaoMovementLineRow = S["Tables"]["saao_movement_lines"]["Row"];
export type SaaoObligationRow = S["Tables"]["saao_obligations"]["Row"];
export type SaaoAllotmentRow = S["Tables"]["saao_allotments"]["Row"];
export type SaaoLineExtraRow = S["Tables"]["saao_line_extras"]["Row"];
export type SaaoReportRow = S["Tables"]["saao_reports"]["Row"];
