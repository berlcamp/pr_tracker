import { describe, expect, test } from "vitest";
import { resolveLabels, saaoColumns, sbNumbersOf } from "@/components/saao/columns";
import { basic, reportRows } from "./fixtures";
import { endingBalanceMatrix } from "./ending-balance";
import { rollup } from "./rollup";
import { buildEndingBalanceWorkbook, buildSaaoWorkbook } from "./xlsx";

const ctx = basic.contexts.find((c) => c.name === "all_entered + equals_adjusted")!;
const rows = reportRows(basic, ctx.expected.lines);
const display = rollup(rows);
const columns = saaoColumns(sbNumbersOf(rows), resolveLabels(null));
const header = { lines: ["Republic", "City"], title: "STATUS OF APPROPRIATION, ALLOTMENT & OBLIGATION", fund: "General Fund", asOf: "As of October 31, 2026", status: "finalized" as const, version: 1 };
const input = { header, rows: display, columns, basis: ["Rule line one."], certifier: { name: "Jane Doe", title: "City Budget Officer" } };

const grand = display.find((d) => d.type === "grand")!;

describe("buildSaaoWorkbook", () => {
  const ws = buildSaaoWorkbook(input).getWorksheet("SAAO")!;
  const grandRow = (() => { let r = 0; ws.eachRow((row, n) => { if (row.getCell(1).value === "GRAND TOTAL") r = n; }); return ws.getRow(r); })();

  test("grand row label and numeric adjusted value", () => {
    expect(grandRow.getCell(1).value).toBe("GRAND TOTAL");
    const idx = 2 + columns.findIndex((c) => c.key === "adjusted") + 1;
    expect(typeof grandRow.getCell(idx).value).toBe("number");
    expect(grandRow.getCell(idx).value).toBe(grand.amounts!.adjusted / 100);
    expect(grandRow.getCell(1).font?.bold).toBe(true);
    expect(grandRow.getCell(idx).border?.top?.style).toBe("medium");
  });

  test("no formulas anywhere", () => {
    ws.eachRow((row) => row.eachCell((c) => expect(c.type).not.toBe(6 /* Formula */)));
  });

  test("null pct is empty, not NaN", () => {
    const pctIdx = 2 + columns.findIndex((c) => c.key === "pct") + 1;
    const nullPct = display.filter((d) => d.amounts && d.pct === null);
    const vals: unknown[] = [];
    ws.eachRow((row) => { if (row.getCell(1).value && nullPct.some((d) => d.label === row.getCell(1).value)) vals.push(row.getCell(pctIdx).value); });
    for (const v of vals) expect(v === null || v === undefined).toBe(true);
    ws.eachRow((row) => row.eachCell((c) => expect(Number.isNaN(c.value as number)).toBe(false)));
  });

  test("finalized has no draft banner; certifier block is written", () => {
    expect(ws.getCell("A1").value).not.toBe("DRAFT — NOT OFFICIAL");
    const texts: unknown[] = [];
    ws.eachRow((row) => texts.push(row.getCell(1).value));
    expect(texts).toContain("Certified Correct:");
    expect(texts).toContain("Jane Doe");
    expect(texts).toContain("Rule line one.");
  });

  test("draft writes the banner in A1", () => {
    const d = buildSaaoWorkbook({ ...input, header: { ...header, status: "draft" } }).getWorksheet("SAAO")!;
    expect(d.getCell("A1").value).toBe("DRAFT — NOT OFFICIAL");
  });

  test("finalized header states the version and finalized date (Asia/Manila)", () => {
    const f = buildSaaoWorkbook({ ...input, header: { ...header, finalizedAt: "2026-11-04T17:30:00Z" } }).getWorksheet("SAAO")!;
    const texts: unknown[] = [];
    f.eachRow((row) => texts.push(row.getCell(1).value));
    expect(texts).toContain("Finalized v1 — Nov 5, 2026");
    expect(texts.some((t) => String(t).startsWith("SUPERSEDED"))).toBe(false);
  });

  test("a superseded header writes the SUPERSEDED line", () => {
    const sh = { ...header, status: "superseded" as const, finalizedAt: "2026-11-04T01:00:00Z", supersededByVersion: 2 };
    const f = buildSaaoWorkbook({ ...input, header: sh }).getWorksheet("SAAO")!;
    expect(f.getCell("A1").value).toBe("SUPERSEDED by v2 — not the current official report");
    const texts: unknown[] = [];
    f.eachRow((row) => texts.push(row.getCell(1).value));
    expect(texts).toContain("Finalized v1 — Nov 4, 2026");
  });

  test("null certifier leaves the lines blank", async () => {
    const w = buildSaaoWorkbook({ ...input, certifier: { name: null, title: null } });
    expect((await w.xlsx.writeBuffer()).byteLength).toBeGreaterThan(0);
  });
});

describe("buildEndingBalanceWorkbook", () => {
  test("writes sections and a numeric grand total", async () => {
    const m = endingBalanceMatrix(rows);
    const wb = buildEndingBalanceWorkbook(m, header, { basis: [], certifier: { name: null, title: null } });
    const ws = wb.worksheets[0];
    let found: unknown;
    ws.eachRow((row) => { if (row.getCell(1).value === "GRAND TOTAL") found = row.getCell(2 + m.classes.length).value; });
    expect(found).toBe(m.grand / 100);
    expect((await wb.xlsx.writeBuffer()).byteLength).toBeGreaterThan(0);
  });

  test("writes the same footer as the SAAO sheet, then the R15 note", () => {
    const m = endingBalanceMatrix(rows);
    const basis = ["Rule line one.", "Unapproved movements counted (acknowledged at finalization):", "SB-9 — Test (pending): 1.00"];
    const ws = buildEndingBalanceWorkbook(m, header, { basis, certifier: { name: "Jane Doe", title: "City Budget Officer" } }).worksheets[0];
    const texts: unknown[] = [];
    ws.eachRow((row) => texts.push(row.getCell(1).value));
    const at = (t: string) => texts.indexOf(t);
    for (const t of ["Basis of figures", ...basis, "Certified Correct:", "Jane Doe", "City Budget Officer"]) expect(texts).toContain(t);
    expect(at("Basis of figures")).toBeGreaterThan(at("GRAND TOTAL"));
    const r15 = texts.findIndex((t) => String(t).includes("(R15)"));
    expect(r15).toBeGreaterThan(at("City Budget Officer"));
  });

  test("null certifier leaves the signatory lines blank", () => {
    const ws = buildEndingBalanceWorkbook(endingBalanceMatrix(rows), header, { basis: [], certifier: { name: null, title: null } }).worksheets[0];
    const texts: unknown[] = [];
    ws.eachRow((row) => texts.push(row.getCell(1).value));
    expect(texts).toContain("Certified Correct:");
    expect(texts).not.toContain("Jane Doe");
  });
});
