import { describe, expect, test, vi } from "vitest";

// queries.ts is server-only; the row mapper under test is pure.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getReportRows, toReportRow } from "./queries";

const line = {
  seq: 3, node_id: "11111111-1111-1111-1111-111111111111", parent_seq: 2, depth: 2, kind: "line",
  label: "Salaries", account_code: "5-01-01-010", classification_code: "PS", classification_name: "Personal Services",
  section_seq: 1, total_label: null, show_total: true,
  appropriation: "1477560233.28", nta: 0, sb: { "1": "1000.50", "12": -250 }, supplemental: "750.50", realignment: "0.00",
  total_changes: "750.50", adjusted: "1477560983.78", allotment: "1477560983.78", obligation: "100.00",
  months: ["100.00", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  balance_appropriation: "1477560883.78", balance_allotment: "1477560883.78",
  cna_1: 0, cna_2: 0, cna_3: 0, savings: "1.25", savings_half: "0.63",
};

describe("toReportRow", () => {
  test("maps numeric strings to centavos and snake_case to camelCase", () => {
    const r = toReportRow(line);
    expect(r.seq).toBe(3);
    expect(r.parentSeq).toBe(2);
    expect(r.nodeId).toBe(line.node_id);
    expect(r.classificationCode).toBe("PS");
    expect(r.amounts?.appropriation).toBe(147756023328);
    expect(r.amounts?.sb).toEqual({ "1": 100050, "12": -25000 });
    expect(r.amounts?.savingsHalf).toBe(63);
    expect(r.amounts?.balanceAllotment).toBe(147756088378);
  });

  test("months become 12 centavo numbers", () => {
    const m = toReportRow(line).amounts!.months;
    expect(m).toHaveLength(12);
    expect(m[0]).toBe(10000);
    expect(m.every((x) => typeof x === "number")).toBe(true);
  });

  test("non-line rows have null amounts", () => {
    const r = toReportRow({
      seq: 1, node_id: null, parent_seq: null, depth: 0, kind: "section", label: "A", account_code: null,
      classification_code: null, classification_name: null, section_seq: 1, total_label: "Total", show_total: true,
      appropriation: null, nta: null, sb: null, months: null,
    });
    expect(r.amounts).toBeNull();
    expect(r.parentSeq).toBeNull();
    expect(r.totalLabel).toBe("Total");
  });
});

describe("paging past PostgREST max_rows", () => {
  test("getReportRows reads every 1000-row page", async () => {
    const all = Array.from({ length: 2345 }, (_, i) => ({ seq: i + 1, parent_seq: null, depth: 0, kind: "note", label: `r${i + 1}`, show_total: true }));
    const ranges: [number, number][] = [];
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      range: (from: number, to: number) => { ranges.push([from, to]); return Promise.resolve({ data: all.slice(from, to + 1), error: null }); },
    };
    vi.mocked(createClient).mockResolvedValue({ from: () => builder } as never);
    const rows = await getReportRows("r");
    expect(rows).toHaveLength(2345);
    expect(rows.at(-1)!.label).toBe("r2345");
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});
