import { describe, expect, test } from "vitest";
import { endingBalanceMatrix } from "./ending-balance";
import { basic, reportRows } from "./fixtures";
import { rollup, sectionSummaries } from "./rollup";

const ctx = basic.contexts.find((c) => c.name === "all_entered + equals_adjusted")!;
const rows = reportRows(basic, ctx.expected.lines);
const m = endingBalanceMatrix(rows);

describe("endingBalanceMatrix", () => {
  test("has one row per section, in report order", () => {
    expect(m.sections.map((s) => s.seq)).toEqual(sectionSummaries(rows).map((s) => s.seq));
  });

  test("columns are PS, MOOE, CO then Unclassified", () => {
    expect(m.classes.map((c) => c.code)).toEqual(["PS", "MOOE", "CO", "UNCLASSIFIED"]);
  });

  test("each row total equals the sum of its cells and the section's balance of allotment", () => {
    const summaries = new Map(sectionSummaries(rows).map((s) => [s.seq, s]));
    for (const s of m.sections) {
      expect(s.total).toBe(Object.values(s.byClass).reduce((a, b) => a + b, 0));
      expect(s.total).toBe(summaries.get(s.seq)!.amounts.balanceAllotment);
    }
  });

  test("column totals sum the cells and the grand total equals the rollup grand balance of allotment", () => {
    for (const c of m.classes) {
      expect(m.columnTotals[c.code]).toBe(m.sections.reduce((a, s) => a + (s.byClass[c.code] ?? 0), 0));
    }
    const grand = rollup(rows).find((d) => d.type === "grand")!.amounts!.balanceAllotment;
    expect(m.grand).toBe(grand);
    expect(m.grand).toBe(ctx.expected.totals.balanceAllotment);
    expect(Object.values(m.columnTotals).reduce((a, b) => a + b, 0)).toBe(grand);
  });

  test("the stand-alone line lands in UNCLASSIFIED", () => {
    const standalone = m.sections.find((s) => s.label === "Confidential Expenses")!;
    expect(Object.keys(standalone.byClass)).toEqual(["UNCLASSIFIED"]);
    expect(standalone.byClass.UNCLASSIFIED).toBe(ctx.expected.lines.l6.balanceAllotment);
  });

  test("is empty for no rows", () => {
    expect(endingBalanceMatrix([])).toEqual({ sections: [], classes: [], columnTotals: {}, grand: 0 });
  });
});
