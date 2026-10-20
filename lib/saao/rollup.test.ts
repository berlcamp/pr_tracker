import { describe, expect, test } from "vitest";
import { classificationTotals, monthlyTotals, rollup, sectionSummaries } from "./rollup";
import { sumAmounts, zeroAmounts } from "./calc";
import { basic, reportRows } from "./fixtures";
import type { LineAmounts, NodeKind, ReportRow } from "./types";

const ctx = basic.contexts.find((c) => c.name === "all_entered + equals_adjusted")!;
const lines = ctx.expected.lines;
const rows = reportRows(basic, lines);
const display = rollup(rows);
const byKey = new Map(display.map((d) => [d.key, d]));
const seqOf = (key: string) => rows.find((r) => r.nodeId === key)!.seq;
const subtotalOf = (key: string) => byKey.get(`t-${seqOf(key)}`)!;

function amounts(over: Partial<LineAmounts>): LineAmounts {
  return { ...zeroAmounts(), ...over };
}
function row(seq: number, parentSeq: number | null, depth: number, kind: NodeKind, label: string, a: LineAmounts | null = null, extra: Partial<ReportRow> = {}): ReportRow {
  return {
    seq, parentSeq, depth, kind, nodeId: `n${seq}`, label, accountCode: null,
    classificationCode: null, classificationName: null, totalLabel: null, showTotal: true,
    amounts: kind === "line" ? a ?? zeroAmounts() : null,
    ...extra,
  };
}

describe("rollup", () => {
  test("emits nodes in tree order with subtotals after each heading and a grand total", () => {
    expect(display.map((d) => `${d.type}:${d.label}`)).toEqual([
      "node:City Mayor's Office",
      "node:Personal Services",
      "node:Salaries and Wages - Regular",
      "subtotal:TOTAL Personal Services",
      "node:Maintenance and Other Operating Expenses",
      "node:Travelling Expenses",
      "node:Library",
      "node:Library Supplies",
      "node:Books and periodicals",
      "subtotal:TOTAL Library",
      "subtotal:TOTAL Maintenance and Other Operating Expenses",
      "node:Capital Outlay",
      "node:Office Equipment",
      "subtotal:TOTAL Capital Outlay",
      "subtotal:TOTAL City Mayor's Office",
      "node:Peace and Order Program",
      "node:Maintenance and Other Operating Expenses",
      "node:Combating Crime and Disorder",
      "subtotal:TOTAL Maintenance and Other Operating Expenses",
      "subtotal:TOTAL Peace and Order Program",
      "node:Confidential Expenses",
      "grand:GRAND TOTAL",
    ]);
    expect(new Set(display.map((d) => d.key)).size).toBe(display.length);
  });

  test("subtotal of a group equals the sum of its lines", () => {
    expect(subtotalOf("grp_lib").amounts).toEqual(lines.l3);
    const mooe = subtotalOf("cls_a_mooe").amounts!;
    expect(mooe.adjusted).toBe(4850050 + 2100000);
    expect(mooe.obligation).toBe(430025 + 1850000);
    expect(mooe.sb).toEqual({ "1": 250050, "2": 100000 });
    expect(mooe.months[8]).toBe(120000 + 1850000);
    const cmo = subtotalOf("sec_a").amounts!;
    expect(cmo.adjusted).toBe(10466667 + 4850050 + 2100000 + 0);
    expect(cmo.savingsHalf).toBe(2210013 + 125000);
  });

  test("headings and notes carry no amounts; lines carry their own", () => {
    const note = byKey.get(`n-${seqOf("n1")}`)!;
    expect(note.amounts).toBeNull();
    expect(note.pct).toBeNull();
    expect(byKey.get(`n-${seqOf("grp_lib")}`)!.amounts).toBeNull();
    expect(byKey.get(`n-${seqOf("l2")}`)!.amounts).toEqual(lines.l2);
  });

  test("zero adjusted line has null pct", () => {
    expect(byKey.get(`n-${seqOf("l4")}`)!.pct).toBeNull();
    expect(subtotalOf("cls_a_co").pct).toBeNull();
  });

  test("subtotal pct is computed from the totals (§2.4: 40.24%)", () => {
    const r = rollup([
      row(1, null, 0, "group", "G"),
      row(2, 1, 1, "line", "a", amounts({ adjusted: 100000000000, obligation: 40000000000 })),
      row(3, 1, 1, "line", "b", amounts({ adjusted: 51688286636, obligation: 21036503867 })),
    ]);
    const sub = r.find((d) => d.type === "subtotal")!;
    expect(sub.amounts!.obligation).toBe(61036503867);
    expect(sub.amounts!.adjusted).toBe(151688286636);
    expect(sub.pct).toBeCloseTo(40.24, 2);
    expect(sub.pct!.toFixed(2)).toBe("40.24");
  });

  test("negative adjusted gives pct null", () => {
    const r = rollup([
      row(1, null, 0, "group", "G"),
      row(2, 1, 1, "line", "a", amounts({ adjusted: -50000, obligation: 1000 })),
    ]);
    expect(r.find((d) => d.type === "node" && d.label === "a")!.pct).toBeNull();
    expect(r.find((d) => d.type === "subtotal")!.pct).toBeNull();
  });

  test("custom total label, show_total off, and headings without lines", () => {
    const r = rollup([
      row(1, null, 0, "section", "S", null, { totalLabel: "TOTAL APPROPRIATION – S" }),
      row(2, 1, 1, "group", "Hidden total", null, { showTotal: false }),
      row(3, 2, 2, "line", "x", amounts({ adjusted: 100 })),
      row(4, 1, 1, "group", "Empty group"),
      row(5, 4, 2, "note", "just text"),
    ]);
    expect(r.map((d) => `${d.type}:${d.label}`)).toEqual([
      "node:S",
      "node:Hidden total",
      "node:x",
      "node:Empty group",
      "node:just text",
      "subtotal:TOTAL APPROPRIATION – S",
      "grand:GRAND TOTAL",
    ]);
    expect(r[5].amounts!.adjusted).toBe(100);
  });

  test("sectionSeq filters to one section and omits the grand total", () => {
    const secB = seqOf("sec_b");
    const r = rollup(rows, { sectionSeq: secB });
    expect(r.map((d) => d.label)).toEqual([
      "Peace and Order Program",
      "Maintenance and Other Operating Expenses",
      "Combating Crime and Disorder",
      "TOTAL Maintenance and Other Operating Expenses",
      "TOTAL Peace and Order Program",
    ]);
    expect(r.every((d) => d.sectionSeq === secB)).toBe(true);
  });

  test("grand total equals the fixture's hand-computed totals", () => {
    const grand = byKey.get("grand")!;
    expect(grand.amounts).toEqual(ctx.expected.totals);
    expect(grand.sectionSeq).toBeNull();
    expect(grand.pct).toBeCloseTo((6980025 / 25216717) * 100, 10);
  });
});

describe("summaries", () => {
  const sections = sectionSummaries(rows);

  test("sectionSummaries counts the stand-alone line as a section", () => {
    expect(sections.map((s) => s.label)).toEqual([
      "City Mayor's Office",
      "Peace and Order Program",
      "Confidential Expenses",
    ]);
    expect(sections[2].seq).toBe(seqOf("l6"));
    expect(sections[2].amounts).toEqual(lines.l6);
    expect(sections[1].amounts).toEqual(lines.l5);
    expect(sections[1].pct).toBeCloseTo((1200000 / 3600000) * 100, 10);
  });

  test("the grand total equals the sum of section summaries", () => {
    expect(sumAmounts(sections.map((s) => s.amounts))).toEqual(byKey.get("grand")!.amounts);
  });

  test("classificationTotals uses nearest classification and puts the stand-alone line under UNCLASSIFIED", () => {
    const totals = classificationTotals(rows);
    expect(totals.map((t) => t.code)).toEqual(["PS", "MOOE", "CO", "UNCLASSIFIED"]);
    expect(totals[0].amounts).toEqual(lines.l1);
    expect(totals[1].name).toBe("Maintenance and Other Operating Expenses");
    expect(totals[1].amounts.adjusted).toBe(4850050 + 2100000 + 3600000);
    expect(totals[2].amounts).toEqual(lines.l4);
    expect(totals[3]).toEqual({ code: "UNCLASSIFIED", name: "Unclassified", amounts: lines.l6 });
  });

  test("a line's own classification overrides its ancestor", () => {
    const totals = classificationTotals([
      row(1, null, 0, "classification", "MOOE", null, { classificationCode: "MOOE", classificationName: "MOOE name" }),
      row(2, 1, 1, "line", "a", amounts({ adjusted: 10 })),
      row(3, 1, 1, "line", "b", amounts({ adjusted: 20 }), { classificationCode: "CO", classificationName: "Capital Outlay" }),
    ]);
    expect(totals.map((t) => [t.code, t.amounts.adjusted])).toEqual([["MOOE", 10], ["CO", 20]]);
  });

  test("monthlyTotals", () => {
    expect(monthlyTotals(rows)).toEqual(ctx.expected.totals.months);
    expect(monthlyTotals([])).toEqual(Array(12).fill(0));
  });
});
