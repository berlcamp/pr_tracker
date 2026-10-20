import { describe, expect, test } from "vitest";
import { compactPeso, pickDefaultReport, rowsOfSection, summaryCards, topSections } from "./dashboard";
import { zeroAmounts } from "./calc";
import { basic, reportRows } from "./fixtures";
import { sectionSummaries } from "./rollup";
import type { LineAmounts, ReportRow } from "./types";

const ctx = basic.contexts.find((c) => c.name === "all_entered + equals_adjusted")!;
const rows = reportRows(basic, ctx.expected.lines);
const totals = ctx.expected.totals;

describe("pickDefaultReport", () => {
  test("ignores a newer draft and returns the latest finalized", () => {
    expect(pickDefaultReport([
      { id: "d", status: "draft", cutoff_date: "2090-11-30" },
      { id: "s", status: "superseded", cutoff_date: "2090-10-31" },
      { id: "f9", status: "finalized", cutoff_date: "2090-09-30" },
      { id: "f10", status: "finalized", cutoff_date: "2090-10-31" },
      { id: "f8", status: "finalized", cutoff_date: "2090-08-31" },
    ])).toBe("f10");
  });

  test("returns null when only drafts (or superseded) exist", () => {
    expect(pickDefaultReport([{ id: "d", status: "draft", cutoff_date: "2090-11-30" }])).toBeNull();
    expect(pickDefaultReport([{ id: "s", status: "superseded", cutoff_date: "2090-11-30" }])).toBeNull();
    expect(pickDefaultReport([])).toBeNull();
  });
});

describe("summaryCards", () => {
  const cards = summaryCards(rows);
  const byKey = new Map(cards.map((c) => [c.key, c]));

  test("lists the 8 cards of spec §8.2 in order", () => {
    expect(cards.map((c) => c.label)).toEqual([
      "Annual Appropriation", "Budget Changes", "Adjusted Appropriation", "Allotments", "Obligations",
      "Balance of Appropriation", "Balance of Allotment", "Obligation %",
    ]);
  });

  test("equals the fixture grand totals", () => {
    expect(byKey.get("appropriation")!.centavos).toBe(totals.appropriation);
    expect(byKey.get("changes")!.centavos).toBe(totals.totalChanges);
    expect(byKey.get("adjusted")!.centavos).toBe(totals.adjusted);
    expect(byKey.get("allotment")!.centavos).toBe(totals.allotment);
    expect(byKey.get("obligation")!.centavos).toBe(totals.obligation);
    expect(byKey.get("balanceAppropriation")!.centavos).toBe(totals.balanceAppropriation);
    expect(byKey.get("balanceAllotment")!.centavos).toBe(totals.balanceAllotment);
    const pct = byKey.get("pct")!;
    expect(pct.centavos).toBeNull();
    expect(pct.pct).toBeCloseTo((totals.obligation / totals.adjusted) * 100, 10);
  });

  test("marks allotment and both balances provisional", () => {
    expect(cards.filter((c) => c.provisional).map((c) => [c.key, c.provisional])).toEqual([
      ["allotment", "R5"], ["balanceAppropriation", "R7"], ["balanceAllotment", "R5"],
    ]);
  });

  test("obligation % is null when there is no adjusted appropriation", () => {
    expect(summaryCards([]).find((c) => c.key === "pct")!.pct).toBeNull();
  });
});

function line(seq: number, label: string, obligation: number): ReportRow {
  const amounts: LineAmounts = { ...zeroAmounts(), obligation, adjusted: obligation * 2 };
  return {
    seq, parentSeq: null, depth: 0, kind: "line", nodeId: `n${seq}`, label, accountCode: null,
    classificationCode: null, classificationName: null, totalLabel: null, showTotal: true, amounts,
  };
}

describe("topSections", () => {
  test("keeps the n largest by obligation and sums the rest into Others", () => {
    const many = Array.from({ length: 20 }, (_, i) => line(i + 1, `S${i + 1}`, (i + 1) * 100));
    const top = topSections(many, 15);
    expect(top).toHaveLength(16);
    expect(top[0].label).toBe("S20");
    expect(top[14].label).toBe("S6");
    expect(top[15]).toMatchObject({ seq: null, label: "Others" });
    expect(top[15].amounts.obligation).toBe(100 + 200 + 300 + 400 + 500);
    expect(top[15].amounts.adjusted).toBe(2 * (100 + 200 + 300 + 400 + 500));
  });

  test("adds no Others row when everything fits", () => {
    const top = topSections(rows);
    expect(top.map((t) => t.label).sort()).toEqual(sectionSummaries(rows).map((s) => s.label).sort());
    expect(top.some((t) => t.seq === null)).toBe(false);
  });
});

describe("rowsOfSection", () => {
  test("returns the section subtree only", () => {
    const sec = sectionSummaries(rows)[1];
    const sub = rowsOfSection(rows, sec.seq);
    expect(sub[0].seq).toBe(sec.seq);
    expect(sub.every((r) => r.depth > 0 || r.seq === sec.seq)).toBe(true);
    expect(summaryCards(sub).find((c) => c.key === "obligation")!.centavos).toBe(sec.amounts.obligation);
  });
});

describe("compactPeso", () => {
  test("compacts pesos for axis ticks", () => {
    expect(compactPeso(151688286636)).toBe("₱1.52B");
    expect(compactPeso(61036503867)).toBe("₱610M");
    expect(compactPeso(123456)).toBe("₱1.23K");
    expect(compactPeso(5000)).toBe("₱50");
    expect(compactPeso(-250000000)).toBe("-₱2.5M");
    expect(compactPeso(0)).toBe("₱0");
  });
});
