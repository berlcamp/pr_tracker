"use server";
import { rpcAction } from "@/lib/actions/rpc";

const paths = (id: string) => [`/prs/${id}`, "/"];

export async function addRemark(prId: string, body: string) {
  return rpcAction("add_remark", { p_pr_id: prId, p_body: body }, paths(prId));
}

export async function addPrivateNote(prId: string, body: string) {
  return rpcAction("add_private_note", { p_pr_id: prId, p_body: body }, paths(prId));
}

export async function receivePr(prId: string) {
  return rpcAction("receive_pr", { p_pr_id: prId }, paths(prId));
}
export async function forwardPr(prId: string, toOfficeId: string, overrideReason: string | null, remark: string | null) {
  return rpcAction("forward_pr", { p_pr_id: prId, p_to_office_id: toOfficeId, p_override_reason: overrideReason, p_remark: remark }, paths(prId));
}
export async function returnPr(prId: string, toOfficeId: string, reason: string) {
  return rpcAction("return_pr", { p_pr_id: prId, p_to_office_id: toOfficeId, p_reason: reason }, paths(prId));
}
export async function recallPr(prId: string, reason: string | null) {
  return rpcAction("recall_pr", { p_pr_id: prId, p_reason: reason }, paths(prId));
}
export async function setStatus(prId: string, statusId: string, remark: string | null) {
  return rpcAction("set_status", { p_pr_id: prId, p_status_id: statusId, p_remark: remark }, paths(prId));
}
export async function assignPrNo(prId: string, prNo: string) {
  return rpcAction("assign_pr_no", { p_pr_id: prId, p_pr_no: prNo }, paths(prId));
}
export async function setModeOfProcurement(prId: string, mode: string) {
  return rpcAction("set_mode_of_procurement", { p_pr_id: prId, p_mode: mode }, paths(prId));
}
export async function completePr(prId: string, remark: string | null) {
  return rpcAction("complete_pr", { p_pr_id: prId, p_remark: remark }, paths(prId));
}
export async function cancelPr(prId: string, reason: string) {
  return rpcAction("cancel_pr", { p_pr_id: prId, p_reason: reason }, paths(prId));
}
export async function followPr(prId: string) {
  return rpcAction("follow_pr", { p_pr_id: prId }, paths(prId));
}
export async function unfollowPr(prId: string) {
  return rpcAction("unfollow_pr", { p_pr_id: prId }, paths(prId));
}

export async function supersedeAttachment(attachmentId: string, prId: string, reason: string) {
  return rpcAction("supersede_attachment", { p_attachment_id: attachmentId, p_reason: reason }, paths(prId));
}
