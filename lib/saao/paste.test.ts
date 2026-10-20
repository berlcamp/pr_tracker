import { describe, expect, test } from "vitest";
import { changesToOps, parseClipboard, planPaste, type PasteTarget } from "./paste";

const t = (nodeId: string, colKey: string, editable: PasteTarget["editable"]): PasteTarget => ({ rowKey: nodeId, nodeId, colKey, editable });
const none = () => "";

describe("parseClipboard", () => {
  test("TSV with a trailing newline gives a 2x2 grid", () => {
    expect(parseClipboard("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  test("CRLF line endings", () => {
    expect(parseClipboard("a\tb\r\n1\t2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  test("quoted cells may hold tabs, newlines and doubled quotes (Excel quoting)", () => {
    expect(parseClipboard('"x\ty"\tz\n')).toEqual([["x\ty", "z"]]);
    expect(parseClipboard('"line 1\nline 2"\t"say ""hi"""\n')).toEqual([["line 1\nline 2", 'say "hi"']]);
  });
  test("a quote inside an unquoted cell is literal", () => {
    expect(parseClipboard('5" pipe\t1')).toEqual([['5" pipe', "1"]]);
  });
  test("empty cells are kept; only the trailing empty line is dropped", () => {
    expect(parseClipboard("a\t\tc\n\t\t\n")).toEqual([["a", "", "c"], ["", "", ""]]);
    expect(parseClipboard("")).toEqual([]);
  });
});

describe("planPaste", () => {
  test("a 3x3 paste onto a 2-column editable area skips the third column of every row", () => {
    const targets = ["l1", "l2", "l3"].map((id) => [t(id, "appropriation", "appropriation"), t(id, "sb-1", "sb"), t(id, "nta", false)]);
    const plan = planPaste([["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]], targets, none);
    expect(plan.skipped).toBe(3);
    expect(plan.changes).toHaveLength(6);
    expect(plan.errors).toEqual([]);
  });
  test("cells beyond the targets are skipped too", () => {
    const plan = planPaste([["1", "2"], ["3", "4"]], [[t("l1", "appropriation", "appropriation")]], none);
    expect(plan.skipped).toBe(3);
    expect(plan.changes).toHaveLength(1);
  });
  test("a paste onto the Adjusted column changes nothing", () => {
    const plan = planPaste([["1"], ["2"]], [[t("l1", "adjusted", false)], [t("l2", "adjusted", false)]], none);
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toBe(2);
  });
  test("amounts go through parseAmount", () => {
    const plan = planPaste([["1,000.50"]], [[t("l1", "appropriation", "appropriation")]], () => "0.00");
    expect(plan.changes).toEqual([{ nodeId: "l1", colKey: "appropriation", from: "0.00", to: "1,000.50", centavos: 100050, entry: null }]);
  });
  test("invalid amounts are errors with their row and column", () => {
    const targets = [[t("l1", "appropriation", "appropriation"), t("l1", "sb-1", "sb")], [t("l2", "appropriation", "appropriation"), t("l2", "sb-1", "sb")]];
    const plan = planPaste([["1", "2"], ["3", "x"]], targets, none);
    expect(plan.errors).toEqual([{ row: 1, col: 1, message: "Amount must be a number" }]);
    expect(plan.changes).toHaveLength(3);
  });
  test("unchanged cells produce no change", () => {
    const plan = planPaste([["1,000.00", "Salaries"]], [[t("l1", "appropriation", "appropriation"), t("l1", "label", "label")]],
      (_n, col) => (col === "label" ? "Salaries" : "1000"));
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toBe(0);
  });
  test("labels are required; codes are validated and may be blank", () => {
    const targets = [[t("l1", "label", "label"), t("l1", "code", "code")], [t("l2", "label", "label"), t("l2", "code", "code")]];
    const plan = planPaste([["", "5-02"], ["Travel", ""]], targets, () => "old");
    expect(plan.errors).toEqual([
      { row: 0, col: 0, message: "A label is required" },
      { row: 0, col: 1, message: "Code must look like 5-02-03-010" },
    ]);
    expect(plan.changes).toEqual([
      { nodeId: "l2", colKey: "label", from: "old", to: "Travel" },
      { nodeId: "l2", colKey: "code", from: "old", to: "" },
    ]);
  });
  test("extras accept a balance keyword, an amount or blank", () => {
    const targets = [[t("l1", "cna1", "extra"), t("l1", "cna2", "extra"), t("l1", "savings", "extra")]];
    const plan = planPaste([["Balance", "12.5", ""]], targets, () => "1.00");
    expect(plan.changes).toEqual([
      { nodeId: "l1", colKey: "cna1", from: "1.00", to: "Balance", entry: "balance" },
      { nodeId: "l1", colKey: "cna2", from: "1.00", to: "12.5", centavos: 1250, entry: null },
      { nodeId: "l1", colKey: "savings", from: "1.00", to: "", entry: null },
    ]);
  });
});

describe("changesToOps", () => {
  const ctx = { sbMovementIds: { "2": "mov-sb2" }, bookId: "book-1" };
  test("obligation and movement_line ops carry the right ids", () => {
    const ops = changesToOps([
      { nodeId: "n1", colKey: "m4", from: "", to: "1+2", centavos: 300, entry: "1+2" },
      { nodeId: "n2", colKey: "sb-2", from: "", to: "5", centavos: 500, entry: null },
      { nodeId: "n3", colKey: "mv:mov-9", from: "", to: "-7.25", centavos: -725, entry: null },
    ], ctx);
    expect(ops).toEqual([
      { op: "obligation", node_id: "n1", month: 4, amount: 3, entry: "1+2" },
      { op: "movement_line", movement_id: "mov-sb2", node_id: "n2", amount: 5 },
      { op: "movement_line", movement_id: "mov-9", node_id: "n3", amount: -7.25 },
    ]);
  });
  test("node fields and extras", () => {
    const ops = changesToOps([
      { nodeId: "n1", colKey: "label", from: "", to: " Travel " },
      { nodeId: "n1", colKey: "code", from: "x", to: "" },
      { nodeId: "n1", colKey: "appropriation", from: "", to: "1,000.50", centavos: 100050, entry: null },
      { nodeId: "n1", colKey: "cna3", from: "", to: "bal", entry: "balance" },
      { nodeId: "n1", colKey: "savings", from: "", to: "2", centavos: 200, entry: null },
      { nodeId: "n1", colKey: "cna1", from: "1", to: "", entry: null },
    ], ctx);
    expect(ops).toEqual([
      { op: "update_node", id: "n1", patch: { label: "Travel" } },
      { op: "update_node", id: "n1", patch: { account_code: null } },
      { op: "update_node", id: "n1", patch: { appropriation: 1000.5 } },
      { op: "extra", node_id: "n1", field: "cna_3", mode: "balance", amount: null },
      { op: "extra", node_id: "n1", field: "savings", mode: "amount", amount: 2 },
      { op: "extra", node_id: "n1", field: "cna_1", mode: null, amount: null },
    ]);
  });
  test("an SB column without a movement is an error", () => {
    expect(() => changesToOps([{ nodeId: "n1", colKey: "sb-7", from: "", to: "1", centavos: 100 }], ctx)).toThrow("SB-7 does not exist yet");
  });
});
