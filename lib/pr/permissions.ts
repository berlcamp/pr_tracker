import type { MovementState, Role } from "../types";

export type PrAction =
  | "edit" | "upload_pr_document" | "forward" | "receive" | "return" | "recall" | "set_status" | "add_remark"
  | "add_private_note" | "add_attachment" | "assign_pr_no" | "set_mode" | "complete" | "cancel";

export type PrForActions = {
  movement_state: MovementState;
  origin_office_id: string;
  current_office_id: string;
  sent_by_office_id: string | null;
  has_pr_document: boolean;
};

export type ActorForActions = {
  role: Role;
  office: { id: string; can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean } | null;
};

/** UI mirror of the DB rules (DB remains the authority). */
export function availableActions(pr: PrForActions, actor: ActorForActions): Set<PrAction> {
  const a = new Set<PrAction>();
  const office = actor.office;
  if (!office) return a;

  const isOrigin = pr.origin_office_id === office.id;
  const receivedHere = pr.movement_state === "received" && pr.current_office_id === office.id;
  const draftHere = pr.movement_state === "draft" && isOrigin;
  const holds = receivedHere || draftHere;
  const pending = pr.movement_state === "in_transit" || pr.movement_state === "returned";

  if (draftHere || (receivedHere && isOrigin)) { a.add("edit"); a.add("upload_pr_document"); a.add("cancel"); }
  if (holds) { a.add("add_private_note"); if (pr.has_pr_document) a.add("forward"); }
  if (holds || isOrigin) { a.add("add_remark"); a.add("add_attachment"); }
  if (pending && pr.current_office_id === office.id) a.add("receive");
  if (pending && pr.sent_by_office_id === office.id) a.add("recall");
  if (receivedHere) {
    a.add("return");
    a.add("set_status");
    if (office.can_assign_pr_no) a.add("assign_pr_no");
    if (office.can_set_mode_of_procurement) a.add("set_mode");
    if (office.can_complete) a.add("complete");
  }
  return a;
}
