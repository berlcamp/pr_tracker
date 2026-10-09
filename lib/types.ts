export type MovementState = "draft" | "in_transit" | "received" | "returned" | "completed" | "cancelled";
export type Role = "super_admin" | "admin" | "staff";
export type EventType =
  | "created" | "edited" | "forwarded" | "recalled" | "received" | "returned" | "status_changed"
  | "remark_added" | "private_note_added" | "attachment_added" | "attachment_superseded"
  | "pr_document_uploaded" | "pr_no_assigned" | "mode_set" | "completed" | "cancelled" | "followed" | "unfollowed";

export type OfficeRef = {
  id: string; code: string; name: string;
  can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean;
};

export type Profile = {
  id: string; email: string; full_name: string; designation: string | null;
  role: Role; office: OfficeRef | null;
};
