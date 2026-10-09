import { describe, expect, test } from "vitest";
import { daysBetween, formatDaysHere, formatPeso, locationLine } from "./format";

const now = new Date("2026-10-12T02:00:00Z");

describe("format", () => {
  test("daysBetween is non-negative fractional days", () => {
    expect(daysBetween("2026-10-09T02:00:00Z", now)).toBe(3);
    expect(daysBetween("2026-10-13T02:00:00Z", now)).toBe(0);
  });
  test("formatDaysHere", () => {
    expect(formatDaysHere(0.4)).toBe("less than a day");
    expect(formatDaysHere(1.2)).toBe("1 day");
    expect(formatDaysHere(3.9)).toBe("3 days");
  });
  test("formatPeso", () => {
    expect(formatPeso(2695)).toBe("₱2,695.00");
  });
  test("locationLine received with status", () => {
    expect(locationLine({
      movement_state: "received", current_office_name: "Mayor's Office",
      current_status_label: "For Mayor's approval", current_purpose: "For approval",
      current_since: "2026-10-09T02:00:00Z", route_step: 4, total_steps: 10,
    }, now)).toBe("Received at Mayor's Office · For Mayor's approval · 3 days here");
  });
  test("locationLine in transit shows purpose and step", () => {
    expect(locationLine({
      movement_state: "in_transit", current_office_name: "Mayor's Office",
      current_status_label: null, current_purpose: "For signing of NOA / NTP",
      current_since: "2026-10-12T01:00:00Z", route_step: 6, total_steps: 10,
    }, now)).toBe("In transit → Mayor's Office · for signing of NOA / NTP · step 6 of 10");
  });
  test("locationLine off-route transit has no step", () => {
    expect(locationLine({
      movement_state: "in_transit", current_office_name: "Legal Office",
      current_status_label: null, current_purpose: null,
      current_since: "2026-10-12T01:00:00Z", route_step: 3, total_steps: 10,
    }, now)).toBe("In transit → Legal Office");
  });
  test("locationLine returned / draft / completed", () => {
    const base = { current_status_label: null, current_purpose: null, current_since: "2026-10-11T02:00:00Z", route_step: 0, total_steps: 10 };
    expect(locationLine({ ...base, movement_state: "returned", current_office_name: "GSO" }, now)).toBe("Returned → GSO · 1 day waiting");
    expect(locationLine({ ...base, movement_state: "draft", current_office_name: "CSWD" }, now)).toBe("Draft at CSWD");
    expect(locationLine({ ...base, movement_state: "completed", current_office_name: "Treasurer" }, now)).toBe("Completed at Treasurer");
  });
});
