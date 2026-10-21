import { describe, expect, test } from "vitest";
import { describeEvent, diffSnapshots, eventSummary, notificationText } from "./timeline";

const base = {
  actor_name: "Gabriel", actor_office_name: "GSO", from_office_name: null, to_office_name: null, status_label: null,
  override_reason: null, remark: null, to_route_step: null, route_purpose: null, payload: {},
};

describe("timeline", () => {
  test("forward on route", () => {
    expect(describeEvent({ ...base, event_type: "forwarded", to_office_name: "Mayor's Office", route_purpose: "For approval", to_route_step: 4 }, 10))
      .toBe("Forwarded to Mayor's Office for approval (step 4 of 10)");
  });
  test("forward off route with reason", () => {
    expect(describeEvent({ ...base, event_type: "forwarded", to_office_name: "Legal", override_reason: "Needs legal review" }, 10))
      .toBe("Forwarded to Legal outside the default route. Reason: Needs legal review");
  });
  test("PR No. change", () => {
    expect(describeEvent({ ...base, event_type: "pr_no_assigned", payload: { old: "A", new: "B" } }, 10)).toBe("PR No. changed from A to B");
    expect(describeEvent({ ...base, event_type: "pr_no_assigned", payload: { old: null, new: "B" } }, 10)).toBe("PR No. B assigned");
  });
  test("PR document events", () => {
    expect(describeEvent({ ...base, event_type: "pr_document_uploaded", payload: { filename: "pr.pdf", replaced_filename: null } }, 10))
      .toBe("PR document uploaded (pr.pdf)");
    expect(describeEvent({ ...base, event_type: "pr_document_uploaded", payload: { filename: "pr-v2.pdf", replaced_filename: "pr.pdf" } }, 10))
      .toBe("PR document replaced: pr.pdf → pr-v2.pdf");
  });
  test("diffSnapshots lists changed header fields", () => {
    const before = { header: { purpose: "Old", amount: 100, fund_cluster: null } };
    const after = { header: { purpose: "New", amount: 120, fund_cluster: null } };
    expect(diffSnapshots(before, after)).toEqual(['Purpose: "Old" → "New"', 'Amount: "100" → "120"']);
  });
  test("notificationText", () => {
    expect(notificationText({ type: "forwarded", actor_office_name: "CSWD", routing_slip_no: "RS-2026-10-00001" }))
      .toBe("CSWD forwarded RS-2026-10-00001 to your office");
    expect(notificationText({ type: "completed", actor_office_name: "TREAS", routing_slip_no: "RS-1" })).toBe("RS-1 was completed");
  });
  test("event summary separates the reason from the title", () => {
    expect(eventSummary({ ...base, event_type: "returned", to_office_name: "CSWD", remark: "Wrong amount" }, 10))
      .toEqual({ title: "Returned to CSWD", kind: "return", note: { label: "Reason", text: "Wrong amount" } });
    expect(eventSummary({ ...base, event_type: "forwarded", to_office_name: "Legal", override_reason: "Needs review", remark: "FYI" }, 10).note)
      .toEqual({ label: "Reason", text: "Needs review" });
    expect(eventSummary({ ...base, event_type: "forwarded", to_office_name: "GSO", route_purpose: "For review", to_route_step: 1, remark: "FYI" }, 10))
      .toEqual({ title: "Forwarded to GSO for review (step 1 of 10)", kind: "move", note: { label: "Remark", text: "FYI" } });
    expect(eventSummary({ ...base, event_type: "received" }, 10).title).toBe("Received by GSO");
    expect(eventSummary({ ...base, event_type: "completed" }, 10).note).toBeNull();
  });
});
