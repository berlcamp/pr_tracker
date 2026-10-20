import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OUTPUT_PATH, buildFixtureSql } from "../../scripts/saao/fixture-to-sql.ts";
import { basic } from "./fixtures";

describe("generated pgTAP parity test", () => {
  it("matches the committed supabase/tests/17_saao_compute.test.sql", () => {
    let committed = "";
    try {
      committed = readFileSync(OUTPUT_PATH, "utf8");
    } catch {
      /* missing file fails below */
    }
    expect(
      buildFixtureSql(basic as never),
      "17_saao_compute.test.sql is stale or missing: run `pnpm saao:fixture-sql` and commit",
    ).toBe(committed);
  });
});
