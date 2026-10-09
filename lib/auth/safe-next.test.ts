import { expect, test } from "vitest";
import { safeNext } from "./safe-next";

test("only allows same-site relative paths", () => {
  expect(safeNext("/prs/1")).toBe("/prs/1");
  expect(safeNext("//evil.com")).toBe("/");
  expect(safeNext("https://evil.com")).toBe("/");
  expect(safeNext(null)).toBe("/");
  expect(safeNext("/\\evil.com")).toBe("/");
  expect(safeNext("/\t/evil.com")).toBe("/");
  expect(safeNext("/\n/evil.com")).toBe("/");
  expect(safeNext("/\r/evil.com")).toBe("/");
  expect(safeNext("/%09/evil.com")).toBe("/%09/evil.com");
  expect(safeNext("/prs?q=a#x")).toBe("/prs?q=a#x");
  expect(safeNext("/.//evil.com")).toBe("/");
  expect(safeNext("/a/..//evil.com")).toBe("/");
  expect(safeNext("/%2e//evil.com")).toBe("/");
});
