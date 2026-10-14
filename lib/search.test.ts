import { expect, test } from "vitest";
import { parseListParams, searchTarget } from "./search";

test("searchTarget routes RS numbers to tracking page", () => {
  expect(searchTarget(" rs-2026-10-00012 ")).toBe("/track/RS-2026-10-00012");
  expect(searchTarget("bond paper")).toBe("/prs?q=bond%20paper");
  expect(searchTarget("  ")).toBeNull();
});
test("parseListParams applies defaults and whitelists", () => {
  expect(parseListParams({})).toEqual({ page: 1, size: 25, sort: "created_at", dir: "desc", q: "", state: "", office: "", origin: "", from: "", to: "", min: "", max: "" });
  const p = parseListParams({ page: "3", size: "50", sort: "amount.asc", state: "received", q: "paper" });
  expect(p).toMatchObject({ page: 3, size: 50, sort: "amount", dir: "asc", state: "received", q: "paper" });
  expect(parseListParams({ size: "9999", sort: "password.asc", state: "hacked" })).toMatchObject({ size: 25, sort: "created_at", state: "" });
});
test("parseListParams accepts an origin office uuid and rejects junk", () => {
  const id = "0b2f5d1e-1c1a-4c8e-9a4e-3f7f6c2d9b10";
  expect(parseListParams({ origin: id }).origin).toBe(id);
  expect(parseListParams({ origin: "not-a-uuid" }).origin).toBe("");
  expect(parseListParams({ origin: [id, "x"] }).origin).toBe(id);
});

import { sanitizeSearch } from "./search";

test("sanitizeSearch strips PostgREST filter syntax", () => {
  expect(sanitizeSearch("paper,(x)*%")).toBe("paper x");
  expect(sanitizeSearch('a"b\\c:d')).toBe("a b c d");
});
