import { describe, expect, test } from "vitest";
import { computeLine, obligationPct, type CalcContext, type LineInput } from "./calc";
import { totalAmounts } from "./rollup";
import { basic, lineInputs } from "./fixtures";

const inputs = lineInputs(basic);
const ctx = (name: string): CalcContext => {
  const c = basic.contexts.find((x) => x.name === name);
  if (!c) throw new Error(`no context ${name}`);
  return { cutoff: c.cutoff, allotmentMode: c.allotmentMode, movementRule: c.movementRule };
};
const ALL_EQ = "all_entered + equals_adjusted";
const APPROVED_EQ = "approved_only + equals_adjusted";
const ALL_REC = "all_entered + recorded";

const blank = (over: Partial<LineInput> = {}): LineInput => ({
  appropriation: 0,
  movements: [],
  obligations: [],
  allotments: [],
  extras: {},
  ...over,
});
const SEPT: CalcContext = { cutoff: "2090-09-30", allotmentMode: "equals_adjusted", movementRule: "all_entered" };

describe("computeLine matches the shared fixture", () => {
  test("fixture covers all four rule combinations", () => {
    const combos = basic.contexts.map((c) => `${c.movementRule}/${c.allotmentMode}`).sort();
    expect(combos).toEqual([
      "all_entered/equals_adjusted",
      "all_entered/recorded",
      "approved_only/equals_adjusted",
      "approved_only/recorded",
    ]);
  });

  for (const c of basic.contexts) {
    describe(c.name, () => {
      const context: CalcContext = { cutoff: c.cutoff, allotmentMode: c.allotmentMode, movementRule: c.movementRule };
      for (const [key, expected] of Object.entries(c.expected.lines)) {
        test(`line ${key}`, () => {
          expect(computeLine(inputs[key], context)).toEqual(expected);
        });
      }
      test("grand totals", () => {
        const lines = Object.values(inputs).map((i) => computeLine(i, context));
        expect(totalAmounts(lines)).toEqual(c.expected.totals);
      });
    });
  }
});

describe("named rules", () => {
  test("zero appropriation line has null pct", () => {
    const l4 = computeLine(inputs.l4, ctx(ALL_EQ));
    expect(l4.appropriation).toBe(0);
    expect(l4.adjusted).toBe(0);
    expect(obligationPct(l4.obligation, l4.adjusted)).toBeNull();
    const l2 = computeLine(inputs.l2, ctx(ALL_EQ));
    expect(obligationPct(l2.obligation, l2.adjusted)).toBeCloseTo((430025 / 4850050) * 100, 10);
  });

  test("negative adjusted gives null pct", () => {
    expect(obligationPct(100, -1)).toBeNull();
  });

  test("pending movement excluded under approved_only", () => {
    expect(computeLine(inputs.l5, ctx(ALL_EQ)).realignment).toBe(600000);
    expect(computeLine(inputs.l5, ctx(APPROVED_EQ)).realignment).toBe(400000);
    // cancelled movements follow the same switch
    expect(computeLine(inputs.l1, ctx(ALL_EQ)).realignment).toBe(-33333);
    expect(computeLine(inputs.l1, ctx(APPROVED_EQ)).realignment).toBe(0);
  });

  test("October obligation excluded at September cutoff", () => {
    const l1 = computeLine(inputs.l1, ctx(ALL_EQ));
    expect(l1.obligation).toBe(3500000);
    expect(l1.months[9]).toBe(0);
    const oct = computeLine(inputs.l1, { ...ctx(ALL_EQ), cutoff: "2090-10-31" });
    expect(oct.obligation).toBe(4400000);
    expect(oct.months[9]).toBe(900000);
  });

  test("movement dated after the cutoff is excluded, on the cutoff included", () => {
    expect(computeLine(inputs.l4, ctx(ALL_EQ)).realignment).toBe(0);
    const onCutoff = blank({
      movements: [{ kind: "realignment", sbNumber: null, status: "approved", effectiveDate: "2090-09-30", amount: 100 }],
    });
    expect(computeLine(onCutoff, SEPT).realignment).toBe(100);
  });

  test("NTA reduction lowers total changes", () => {
    const l6 = computeLine(inputs.l6, ctx(ALL_EQ));
    expect(l6.nta).toBe(-100000);
    expect(l6.supplemental).toBe(300000);
    expect(l6.totalChanges).toBe(200000);
    expect(l6.adjusted).toBe(4200000);
  });

  test("recorded allotment mode uses approved allotments only", () => {
    expect(computeLine(inputs.l1, ctx(ALL_REC)).allotment).toBe(6000000);
    expect(computeLine(inputs.l2, ctx(ALL_REC)).allotment).toBe(3000000);
    expect(computeLine(inputs.l3, ctx(ALL_REC)).allotment).toBe(1849999);
    expect(computeLine(inputs.l6, ctx(ALL_REC)).allotment).toBe(0);
  });

  test("supplemental sums every SB number and other kinds go to realignment", () => {
    const line = computeLine(
      blank({
        appropriation: 1000,
        movements: [
          { kind: "supplemental", sbNumber: 1, status: "approved", effectiveDate: "2090-01-01", amount: 10 },
          { kind: "supplemental", sbNumber: 6, status: "approved", effectiveDate: "2090-01-01", amount: 20 },
          { kind: "other", sbNumber: null, status: "approved", effectiveDate: "2090-01-01", amount: 5 },
          { kind: "augmentation", sbNumber: null, status: "approved", effectiveDate: "2090-01-01", amount: 7 },
        ],
      }),
      SEPT,
    );
    expect(line.sb).toEqual({ "1": 10, "6": 20 });
    expect(line.supplemental).toBe(30);
    expect(line.realignment).toBe(12);
    expect(line.adjusted).toBe(1042);
  });

  test("savingsHalf rounds half away from zero", () => {
    const half = (savings: number) =>
      computeLine(blank({ extras: { savings: { mode: "amount", amount: savings } } }), SEPT).savingsHalf;
    expect(half(3)).toBe(2);
    expect(half(-3)).toBe(-2);
    expect(half(-1)).toBe(-1);
    expect(half(4)).toBe(2);
    expect(half(0)).toBe(0);
  });

  test("extras: balance mode follows balance of allotment, blank is zero", () => {
    const line = computeLine(
      blank({
        appropriation: 1000,
        obligations: [{ month: 2, amount: 300 }],
        extras: { cna_3: { mode: "balance", amount: null }, cna_1: { mode: "amount", amount: 55 } },
      }),
      SEPT,
    );
    expect(line.balanceAllotment).toBe(700);
    expect(line.cna3).toBe(700);
    expect(line.cna1).toBe(55);
    expect(line.cna2).toBe(0);
    expect(line.savings).toBe(0);
  });
});
