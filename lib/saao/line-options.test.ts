import { describe, expect, test } from "vitest";
import { filterLines, lineOptions, MAX_SHOWN } from "./line-options";
import type { ReportRow } from "./types";

const row = (seq: number, parentSeq: number | null, kind: ReportRow["kind"], label: string, accountCode: string | null = null): ReportRow => ({
  seq, parentSeq, depth: 0, kind, nodeId: `n${seq}`, label, accountCode, classificationCode: kind === "line" ? "MOOE" : null,
  classificationName: null, totalLabel: null, showTotal: true, amounts: null,
});

describe("lineOptions", () => {
  test("builds 'Section › … › Description (code)' for lines only", () => {
    const opts = lineOptions([
      row(1, null, "section", "City Mayor's Office"),
      row(2, 1, "classification", "MOOE"),
      row(3, 2, "line", "Travelling Expenses", "5-02-01-010"),
      row(4, 2, "line", "Confidential Expenses"),
      row(5, null, "line", "Top level line"),
    ]);
    expect(opts.map((o) => o.path)).toEqual([
      "City Mayor's Office › MOOE › Travelling Expenses (5-02-01-010)",
      "City Mayor's Office › MOOE › Confidential Expenses",
      "Top level line",
    ]);
    expect(opts[0]).toMatchObject({ id: "n3", sectionId: "n1", sectionLabel: "City Mayor's Office", code: "5-02-01-010" });
    expect(opts[2].sectionId).toBe("n5");
  });
});

describe("filterLines", () => {
  const many = lineOptions([row(1, null, "section", "Office"), ...Array.from({ length: 977 }, (_, i) => row(i + 2, 1, "line", `Item ${i}`, "5-02-01-010"))]);
  test(`renders at most ${MAX_SHOWN} matches and reports the total`, () => {
    const r = filterLines(many, "");
    expect(r.shown).toHaveLength(MAX_SHOWN);
    expect(r.total).toBe(977);
  });
  test("every word must match the path or code, case-insensitively", () => {
    const hits = filterLines(many, "office ITEM 97");
    expect(hits.shown.every((o) => o.label.includes("97"))).toBe(true);
    expect(hits.total).toBe(many.filter((o) => o.label.includes("97")).length);
    expect(filterLines(many, "5-02-01 item 976").total).toBe(1);
    expect(filterLines(many, "nothing").total).toBe(0);
  });
});
