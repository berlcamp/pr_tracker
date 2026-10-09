import { describe, expect, test } from "vitest";
import { availableActions } from "./permissions";

const office = (id: string, flags: Partial<{ can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean }> = {}) =>
  ({ id, can_assign_pr_no: false, can_set_mode_of_procurement: false, can_complete: false, ...flags });
const staff = (o: ReturnType<typeof office>) => ({ role: "staff" as const, office: o });
const pr = (p: Partial<{ movement_state: string; origin_office_id: string; current_office_id: string; sent_by_office_id: string | null; has_pr_document: boolean }>) =>
  ({ movement_state: "draft", origin_office_id: "cswd", current_office_id: "cswd", sent_by_office_id: null, has_pr_document: true, ...p }) as never;

describe("availableActions", () => {
  test("origin in draft can edit, upload PR document, forward, cancel", () => {
    const a = availableActions(pr({}), staff(office("cswd")));
    expect([...a].sort()).toEqual(["add_attachment", "add_private_note", "add_remark", "cancel", "edit", "forward", "upload_pr_document"]);
  });
  test("no forward until the PR document is uploaded", () => {
    const a = availableActions(pr({ has_pr_document: false }), staff(office("cswd")));
    expect(a.has("forward")).toBe(false);
    expect(a.has("upload_pr_document")).toBe(true);
  });
  test("destination sees receive only while in transit", () => {
    const a = availableActions(pr({ movement_state: "in_transit", current_office_id: "gso", sent_by_office_id: "cswd" }), staff(office("gso")));
    expect([...a]).toEqual(["receive"]);
  });
  test("sender can recall while in transit", () => {
    const a = availableActions(pr({ movement_state: "in_transit", current_office_id: "gso", sent_by_office_id: "cswd" }), staff(office("cswd")));
    expect(a.has("recall")).toBe(true);
    expect(a.has("cancel")).toBe(false);
  });
  test("holder with flags gets PR No., mode and complete", () => {
    const a = availableActions(pr({ movement_state: "received", current_office_id: "treas" }),
      staff(office("treas", { can_assign_pr_no: true, can_set_mode_of_procurement: true, can_complete: true })));
    for (const x of ["forward", "return", "set_status", "assign_pr_no", "set_mode", "complete"]) expect(a.has(x as never)).toBe(true);
  });
  test("admin without office can only cancel non-terminal PRs", () => {
    expect([...availableActions(pr({ movement_state: "received", current_office_id: "gso" }), { role: "admin", office: null })]).toEqual(["cancel"]);
    expect(availableActions(pr({ movement_state: "completed" }), { role: "admin", office: null }).size).toBe(0);
  });
  test("origin edits after return once received back", () => {
    expect(availableActions(pr({ movement_state: "received" }), staff(office("cswd"))).has("edit")).toBe(true);
    expect(availableActions(pr({ movement_state: "received", current_office_id: "gso" }), staff(office("gso"))).has("upload_pr_document")).toBe(false);
    expect(availableActions(pr({ movement_state: "returned" }), staff(office("cswd"))).has("edit")).toBe(false);
  });
});
