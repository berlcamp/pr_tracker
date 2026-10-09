import { expect, test } from "vitest";
import { toCsv } from "./csv";

test("escapes quotes, commas, newlines and neutralises formulas", () => {
  const csv = toCsv([{ a: 'He said "hi"', b: "x,y", c: "=SUM(A1)", d: 2.5 }],
    [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }, { key: "d", header: "D" }]);
  expect(csv).toBe('A,B,C,D\r\n"He said ""hi""","x,y",\'=SUM(A1),2.5');
});
