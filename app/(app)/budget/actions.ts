"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { rpcAction } from "@/lib/actions/rpc";
import { BOOK_COOKIE } from "@/lib/saao/book-cookie";
import type { SaaoRole } from "@/lib/saao/types";

// Every wrapper revalidates /budget as a layout so all budget pages refresh.
async function call<T = null>(fn: string, args: Record<string, unknown>) {
  const result = await rpcAction<T>(`saao_${fn}`, args);
  if (result.ok) revalidatePath("/budget", "layout");
  return result;
}

export async function selectBook(bookId: string) {
  (await cookies()).set(BOOK_COOKIE, bookId, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

// access and setup
export async function setAccess(i: { profileId: string; role: SaaoRole | null }) {
  return call("set_access", { p_profile_id: i.profileId, p_role: i.role });
}
export async function upsertFund(i: { id: string | null; code: string; name: string; active: boolean }) {
  return call<string>("upsert_fund", { p_id: i.id, p_code: i.code, p_name: i.name, p_active: i.active });
}
export async function upsertClassification(i: { id: string | null; code: string; name: string; sortOrder: number; active: boolean }) {
  return call<string>("upsert_classification", { p_id: i.id, p_code: i.code, p_name: i.name, p_sort_order: i.sortOrder, p_active: i.active });
}
export async function createBook(i: { fiscalYear: number; fundId: string; title: string; copyFrom: string | null; copyAppropriations: boolean }) {
  return call<string>("create_book", {
    p_fiscal_year: i.fiscalYear, p_fund_id: i.fundId, p_title: i.title, p_copy_from: i.copyFrom,
    p_copy_appropriations: i.copyAppropriations,
  });
}
export async function updateBook(id: string, patch: Record<string, unknown>) {
  return call("update_book", { p_id: id, p_patch: patch });
}

// structure
export async function addNode(i: {
  bookId: string; parentId: string | null; afterId: string | null; kind: string; label: string;
  accountCode: string | null; classificationId: string | null;
}) {
  return call<string>("add_node", {
    p_book_id: i.bookId, p_parent_id: i.parentId, p_after_id: i.afterId, p_kind: i.kind, p_label: i.label,
    p_account_code: i.accountCode, p_classification_id: i.classificationId,
  });
}
export async function updateNode(id: string, patch: Record<string, unknown>) {
  return call("update_node", { p_id: id, p_patch: patch });
}
export async function moveNode(id: string, newParentId: string | null, afterId: string | null) {
  return call("move_node", { p_id: id, p_new_parent_id: newParentId, p_after_id: afterId });
}
export async function deleteNode(id: string) {
  return call("delete_node", { p_id: id });
}

// data entry
export async function upsertMovement(i: {
  id: string | null; bookId: string; kind: string; sbNumber: number | null; referenceNo: string | null; title: string | null;
  effectiveDate: string; status: string; statusNote: string | null; remarks: string | null;
}) {
  return call<string>("upsert_movement", {
    p_id: i.id, p_book_id: i.bookId, p_kind: i.kind, p_sb_number: i.sbNumber, p_reference_no: i.referenceNo,
    p_title: i.title, p_effective_date: i.effectiveDate, p_status: i.status, p_status_note: i.statusNote, p_remarks: i.remarks,
  });
}
export async function deleteMovement(id: string) {
  return call("delete_movement", { p_id: id });
}
/** `amount` is pesos (numeric), as the RPC takes; callers convert centavos with toPeso. */
export async function setMovementLine(movementId: string, nodeId: string, amount: number) {
  return call("set_movement_line", { p_movement_id: movementId, p_node_id: nodeId, p_amount: amount });
}
export async function setObligation(nodeId: string, month: number, amount: number, entry: string | null) {
  return call("set_obligation", { p_node_id: nodeId, p_month: month, p_amount: amount, p_entry: entry });
}
export async function upsertAllotment(i: {
  id: string | null; nodeId: string; amount: number; referenceNo: string | null; allotmentDate: string | null;
  status: string; remarks: string | null;
}) {
  return call<string>("upsert_allotment", {
    p_id: i.id, p_node_id: i.nodeId, p_amount: i.amount, p_reference_no: i.referenceNo,
    p_allotment_date: i.allotmentDate, p_status: i.status, p_remarks: i.remarks,
  });
}
export async function deleteAllotment(id: string) {
  return call("delete_allotment", { p_id: id });
}
export async function setExtra(nodeId: string, field: "cna_1" | "cna_2" | "cna_3" | "savings", mode: "balance" | "amount" | null, amount: number | null) {
  return call("set_extra", { p_node_id: nodeId, p_field: field, p_mode: mode, p_amount: amount });
}
export async function applyBatch(bookId: string, ops: unknown[]) {
  return call<number>("apply_batch", { p_book_id: bookId, p_ops: ops });
}

// reports
export async function createDraft(bookId: string, cutoff: string) {
  return call<string>("create_draft", { p_book_id: bookId, p_cutoff: cutoff });
}
export async function deleteDraft(reportId: string) {
  return call("delete_draft", { p_report_id: reportId });
}
export async function finalizeReport(reportId: string, acknowledged: string[]) {
  return call("finalize", { p_report_id: reportId, p_acknowledged: acknowledged });
}
export async function startRevision(reportId: string, reason: string) {
  return call<string>("start_revision", { p_report_id: reportId, p_reason: reason });
}
