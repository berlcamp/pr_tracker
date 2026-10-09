import { expect, test } from "vitest";
import { safeNext } from "./safe-next";

test("only allows same-site relative paths", () => {
  expect(safeNext("/prs/1")).toBe("/prs/1");
  expect(safeNext("//evil.com")).toBe("/");
  expect(safeNext("https://evil.com")).toBe("/");
  expect(safeNext(null)).toBe("/");
  expect(safeNext("/\\evil.com")).toBe("/");
});
