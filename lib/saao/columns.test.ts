import { describe, expect, it } from "vitest";
import { resolveLabels, saaoColumns, sbNumbersOf } from "@/components/saao/columns";

const labels = { cna_1: "CNA (1)", cna_2: "CNA (2)", cna_3: "CNA (3)", savings: "Savings" };

describe("saaoColumns", () => {
  it("follows the workbook order with % between CNA1 and CNA2", () => {
    expect(saaoColumns([1, 2, 3], labels).map((c) => c.header)).toEqual([
      "Annual", "NTA", "SB-1", "SB-2", "SB-3", "Supplemental", "Realign/Reversion", "Total Changes", "Adjusted",
      "Allotment", "Obligation", "Bal. Approp.", "Bal. Allot.", "CNA (1)", "%", "CNA (2)", "CNA (3)", "Savings", "50% Savings",
    ]);
  });
  it("uses custom labels and falls back for blanks", () => {
    expect(resolveLabels({ cna_1: "Reserved", cna_2: " " }).cna_2).toBe("CNA (2)");
    expect(saaoColumns([], resolveLabels({ savings: "Unused" })).at(-2)!.header).toBe("Unused");
  });
  it("collects SB numbers numerically", () => {
    const a = (sb: Record<string, number>) => ({ amounts: { sb } as never });
    expect(sbNumbersOf([a({ "10": 1 }), a({ "2": 1 }), { amounts: null }])).toEqual([2, 10]);
  });
});
