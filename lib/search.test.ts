import { expect, test } from "vitest";
import { parseListParams, searchTarget } from "./search";

test("searchTarget routes RS numbers to tracking page", () => {
  expect(searchTarget(" rs-2026-10-00012 ")).toBe("/track/RS-2026-10-00012");
  expect(searchTarget("bond paper")).toBe("/prs?q=bond%20paper");
  expect(searchTarget("  ")).toBeNull();
});
test("parseListParams applies defaults and whitelists", () => {
  expect(parseListParams({})).toEqual({ page: 1, size: 25, sort: "created_at", dir: "desc", q: "", state: "", office: "", from: "", to: "", min: "", max: "" });
  const p = parseListParams({ page: "3", size: "50", sort: "amount.asc", state: "received", q: "paper" });
  expect(p).toMatchObject({ page: 3, size: 50, sort: "amount", dir: "asc", state: "received", q: "paper" });
  expect(parseListParams({ size: "9999", sort: "password.asc", state: "hacked" })).toMatchObject({ size: 25, sort: "created_at", state: "" });
});
