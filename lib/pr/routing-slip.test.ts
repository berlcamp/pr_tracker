import { expect, test } from "vitest";
import { buildSlipRows, trackUrl, truncate } from "./routing-slip";

test("one row per step in order, plus blanks; repeats kept", () => {
  const rows = buildSlipRows([
    { step_order: 2, office_name: "Mayor's Office", purpose: "For approval" },
    { step_order: 1, office_name: "GSO", purpose: "For review" },
    { step_order: 3, office_name: "Mayor's Office", purpose: "For signing" },
  ]);
  expect(rows.map((r) => r.label)).toEqual(["GSO", "Mayor's Office", "Mayor's Office", "", ""]);
  expect(rows[0].purpose).toBe("For review");
});
test("trackUrl", () => {
  expect(trackUrl("https://pr.example.gov.ph/", "RS-2026-10-00001")).toBe("https://pr.example.gov.ph/track/RS-2026-10-00001");
});
test("truncate", () => {
  expect(truncate("abcdef", 4)).toBe("abc…");
  expect(truncate("abc", 4)).toBe("abc");
});
