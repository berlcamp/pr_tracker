import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { RULES, basisOfFigures } from "./rules";

describe("RULES", () => {
  test("rule_classes frozen by saao_finalize (migration 0500) match RULES", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261020000500_saao_reports.sql"), "utf8");
    const m = sql.match(/'rule_classes',\s*'(\{[^']*\})'::jsonb/);
    expect(m, "rule_classes literal not found in migration 0500").not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(Object.fromEntries(RULES.map((r) => [r.id, r.klass])));
  });

  test("R6 and R9 are confirmed formulas with a provisional part (spec §3)", () => {
    const byId = Object.fromEntries(RULES.map((r) => [r.id, r]));
    expect(byId.R6).toMatchObject({ klass: "C", provisional: "cutoff filter" });
    expect(byId.R9).toMatchObject({ klass: "C", provisional: "zero display" });
  });

  test("the basis of figures states the provisional part of R6 and R9", () => {
    const lines = basisOfFigures({ allotmentMode: "equals_adjusted", movementRule: "all_entered" });
    expect(lines.find((l) => l.includes("(R6"))).toMatch(/cutoff filter is provisional/);
    expect(lines.find((l) => l.includes("(R9"))).toMatch(/zero display is provisional/);
  });
});
