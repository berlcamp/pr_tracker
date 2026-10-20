"use server";
import { rpcAction } from "@/lib/actions/rpc";

export type ProfileInput = { id: string | null; email: string; full_name: string; designation: string; office_id: string | null; role: "staff" | "admin"; active: boolean };
export type OfficeInput = { id: string | null; code: string; name: string; is_processing_office: boolean; can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean; active: boolean };
export type StatusInput = { id: string | null; office_id: string; label: string; sort_order: number; active: boolean; allows_completion: boolean };

export async function saveProfile(i: ProfileInput) {
  return rpcAction<string>("admin_upsert_profile", {
    p_id: i.id, p_email: i.email, p_full_name: i.full_name, p_designation: i.designation || null,
    p_office_id: i.office_id, p_role: i.role, p_active: i.active,
  }, ["/admin/users"]);
}
export async function saveOffice(i: OfficeInput) {
  return rpcAction<string>("admin_upsert_office", {
    p_id: i.id, p_code: i.code, p_name: i.name, p_is_processing_office: i.is_processing_office,
    p_can_assign_pr_no: i.can_assign_pr_no, p_can_set_mode_of_procurement: i.can_set_mode_of_procurement,
    p_can_complete: i.can_complete, p_active: i.active,
  }, ["/admin/offices"]);
}
export async function saveRoute(steps: { office_id: string; purpose: string }[]) {
  return rpcAction("admin_set_route", { p_steps: steps }, ["/admin/route"]);
}
export async function saveStatus(i: StatusInput) {
  return rpcAction<string>("admin_upsert_status", {
    p_id: i.id, p_office_id: i.office_id, p_label: i.label, p_sort_order: i.sort_order, p_active: i.active,
    p_allows_completion: i.allows_completion,
  }, ["/admin/statuses"]);
}
export async function deleteStatus(id: string) {
  return rpcAction("admin_delete_status", { p_id: id }, ["/admin/statuses"]);
}
export async function saveSetting(key: "lgu_name" | "stuck_threshold_days" | "max_upload_mb", value: string | number) {
  return rpcAction("admin_set_setting", { p_key: key, p_value: value }, ["/admin/settings"]);
}
