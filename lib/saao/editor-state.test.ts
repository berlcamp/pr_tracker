import { describe, expect, test } from "vitest";
import type { EditorData } from "./queries";
import { applyLocalEdit, buildEditorRows, editFromChange } from "./editor-state";
import { basic, reportRows, type SaaoFixture } from "./fixtures";
import type { CalcContext } from "./calc";

const CLS = {
  PS: { id: "c-ps", code: "PS", name: "Personal Services" },
  MOOE: { id: "c-mooe", code: "MOOE", name: "Maintenance and Other Operating Expenses" },
  CO: { id: "c-co", code: "CO", name: "Capital Outlay" },
} as const;
const T0 = "2090-01-01T00:00:00Z";

/** DB-shaped EditorData from the shared fixture; node ids are the fixture keys. Amounts are pesos (numbers). */
function editorData(f: SaaoFixture): EditorData {
  const pesos = (s: string) => Number(s);
  return {
    classifications: Object.values(CLS).map((c, i) => ({ ...c, sort_order: i, active: true })),
    nodes: f.nodes.map((n) => ({
      id: n.key, book_id: "b", parent_id: n.parentKey, sort_order: n.sortOrder, kind: n.kind, label: n.label,
      account_code: n.accountCode, classification_id: n.classificationCode ? CLS[n.classificationCode as keyof typeof CLS].id : null,
      office_id: null, total_label: null, show_total: true, appropriation: pesos(n.appropriation), appropriation_ref: null,
      active: true, created_at: T0, updated_at: T0,
    })),
    movements: f.movements.map((m) => ({
      id: m.key, book_id: "b", kind: m.kind, sb_number: m.sbNumber, reference_no: null, title: null,
      effective_date: m.effectiveDate, status: m.status, status_note: null, remarks: null, created_by: null,
      created_at: T0, updated_at: T0,
      lines: m.lines.map((l, i) => ({ id: `${m.key}-${i}`, movement_id: m.key, node_id: l.nodeKey, amount: pesos(l.amount) })),
    })),
    obligations: f.obligations.map((o) => ({
      node_id: o.nodeKey, month: o.month, amount: pesos(o.amount), entry: null, updated_by: null, updated_at: T0,
    })),
    allotments: f.allotments.map((a, i) => ({
      id: `a${i}`, node_id: a.nodeKey, amount: pesos(a.amount), reference_no: null, allotment_date: a.date, status: a.status,
      remarks: null, created_by: null, created_at: T0,
    })),
    extras: f.extras.map((e) => ({ node_id: e.nodeKey, field: e.field, mode: e.mode, amount: e.amount === null ? null : pesos(e.amount) })),
  } as unknown as EditorData;
}

const ctx1 = basic.contexts[0];
const CTX: CalcContext = { cutoff: ctx1.cutoff, allotmentMode: ctx1.allotmentMode, movementRule: ctx1.movementRule };

// Effective classification: own for classification nodes, own-or-nearest-ancestor for lines, nearest ancestor otherwise.
const EFFECTIVE: Record<string, keyof typeof CLS | null> = {
  sec_a: null, cls_a_ps: "PS", l1: "PS", cls_a_mooe: "MOOE", l2: "MOOE", grp_lib: "MOOE", l3: "MOOE", n1: "MOOE",
  cls_a_co: "CO", l4: "CO", sec_b: null, cls_b_mooe: "MOOE", l5: "MOOE", l6: null,
};

function expectedRows() {
  return reportRows(basic, ctx1.expected.lines).map((r) => {
    const c = EFFECTIVE[r.nodeId!];
    return { ...r, classificationCode: c ? CLS[c].code : null, classificationName: c ? CLS[c].name : null };
  });
}

describe("buildEditorRows", () => {
  test("matches the fixture rows for context 1", () => {
    expect(buildEditorRows(editorData(basic), CTX)).toEqual(expectedRows());
  });

  test("orders siblings by sort_order, then created_at, then id, whatever the input order", () => {
    const data = editorData(basic);
    data.nodes = [...data.nodes].reverse();
    expect(buildEditorRows(data, CTX).map((r) => r.nodeId)).toEqual(basic.nodes.map((n) => n.key));
    const tie = editorData(basic);
    const l2 = tie.nodes.find((n) => n.id === "l2")!;
    const grp = tie.nodes.find((n) => n.id === "grp_lib")!;
    grp.sort_order = l2.sort_order;
    grp.created_at = "2089-12-31T00:00:00Z"; // earlier, so it now comes first
    const order = buildEditorRows(tie, CTX).map((r) => r.nodeId);
    expect(order.indexOf("grp_lib")).toBeLessThan(order.indexOf("l2"));
  });

  test("inactive nodes and their whole subtree are left out", () => {
    const data = editorData(basic);
    data.nodes.find((n) => n.id === "grp_lib")!.active = false;
    const ids = buildEditorRows(data, CTX).map((r) => r.nodeId);
    expect(ids).not.toContain("grp_lib");
    expect(ids).not.toContain("l3");
    expect(ids).not.toContain("n1");
    expect(ids).toContain("cls_a_co");
  });

  test("a line's own classification overrides its ancestor's", () => {
    const data = editorData(basic);
    data.nodes.find((n) => n.id === "l2")!.classification_id = CLS.CO.id;
    const l2 = buildEditorRows(data, CTX).find((r) => r.nodeId === "l2")!;
    expect(l2.classificationCode).toBe("CO");
  });
});

describe("applyLocalEdit", () => {
  const amountsOf = (data: EditorData, id: string) => buildEditorRows(data, CTX).find((r) => r.nodeId === id)!.amounts!;

  test("an appropriation edit updates that line's adjusted", () => {
    const data = editorData(basic);
    const before = amountsOf(data, "l1");
    const next = applyLocalEdit(data, { kind: "appropriation", nodeId: "l1", centavos: 12000050 });
    const after = amountsOf(next, "l1");
    expect(after.appropriation).toBe(12000050);
    expect(after.adjusted).toBe(before.adjusted + (12000050 - before.appropriation));
    expect(amountsOf(data, "l1")).toEqual(before); // input is not mutated
  });

  test("movement line edits insert, update and delete (0)", () => {
    const data = editorData(basic);
    const ins = applyLocalEdit(data, { kind: "movement_line", movementId: "m2_sb2", nodeId: "l1", centavos: 70000 });
    expect(amountsOf(ins, "l1").sb).toEqual({ "1": 500000, "2": 70000 });
    const upd = applyLocalEdit(ins, { kind: "movement_line", movementId: "m2_sb2", nodeId: "l1", centavos: 1 });
    expect(amountsOf(upd, "l1").sb["2"]).toBe(1);
    const del = applyLocalEdit(upd, { kind: "movement_line", movementId: "m2_sb2", nodeId: "l1", centavos: 0 });
    expect(amountsOf(del, "l1").sb).toEqual({ "1": 500000 });
  });

  test("extra edits set balance mode, an amount, or clear", () => {
    const data = editorData(basic);
    const bal = applyLocalEdit(data, { kind: "extra", nodeId: "l1", field: "cna_3", mode: "balance", centavos: null });
    expect(amountsOf(bal, "l1").cna3).toBe(amountsOf(bal, "l1").balanceAllotment);
    const amt = applyLocalEdit(bal, { kind: "extra", nodeId: "l1", field: "cna_3", mode: "amount", centavos: 999 });
    expect(amountsOf(amt, "l1").cna3).toBe(999);
    const clr = applyLocalEdit(amt, { kind: "extra", nodeId: "l1", field: "cna_3", mode: null, centavos: null });
    expect(amountsOf(clr, "l1").cna3).toBe(0);
  });

  test("node text edits change label and code", () => {
    const next = applyLocalEdit(editorData(basic), { kind: "node", id: "l1", patch: { label: "Salaries", account_code: "5-01-01-020" } });
    const r = buildEditorRows(next, CTX).find((x) => x.nodeId === "l1")!;
    expect(r.label).toBe("Salaries");
    expect(r.accountCode).toBe("5-01-01-020");
  });
});

describe("editFromChange", () => {
  const sb = { "2": "m2_sb2" };
  test("maps grid changes to local edits", () => {
    expect(editFromChange({ nodeId: "l1", colKey: "appropriation", from: "", to: "5", centavos: 500 }, sb))
      .toEqual({ kind: "appropriation", nodeId: "l1", centavos: 500 });
    expect(editFromChange({ nodeId: "l1", colKey: "sb-2", from: "", to: "5", centavos: 500 }, sb))
      .toEqual({ kind: "movement_line", movementId: "m2_sb2", nodeId: "l1", centavos: 500 });
    expect(editFromChange({ nodeId: "l1", colKey: "cna2", from: "", to: "bal", entry: "balance" }, sb))
      .toEqual({ kind: "extra", nodeId: "l1", field: "cna_2", mode: "balance", centavos: null });
    expect(editFromChange({ nodeId: "l1", colKey: "code", from: "", to: "" }, sb))
      .toEqual({ kind: "node", id: "l1", patch: { account_code: null } });
    expect(editFromChange({ nodeId: "l1", colKey: "m3", from: "", to: "1+2", centavos: 300, entry: "1+2" }, sb))
      .toEqual({ kind: "obligation", nodeId: "l1", month: 3, centavos: 300, entry: "1+2" });
    expect(editFromChange({ nodeId: "l1", colKey: "appropriation_ref", from: "", to: " AB 2026-1 " }, sb))
      .toEqual({ kind: "node", id: "l1", patch: { appropriation_ref: "AB 2026-1" } });
    expect(editFromChange({ nodeId: "l1", colKey: "appropriation_ref", from: "x", to: "  " }, sb))
      .toEqual({ kind: "node", id: "l1", patch: { appropriation_ref: null } });
  });
});
