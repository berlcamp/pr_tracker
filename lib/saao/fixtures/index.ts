// Typed access to the shared SAAO fixtures, plus helpers that turn the fixture's
// DB-shaped inputs into calc.ts inputs and rollup.ts rows. Used by the vitest suites.
import { fromNumeric } from "../money";
import type { LineInput } from "../calc";
import type {
  AllotmentMode,
  LineAmounts,
  MovementKind,
  MovementRule,
  NodeKind,
  RecordStatus,
  ReportRow,
} from "../types";
import basicJson from "./basic.json";

export type ExtraField = "cna_1" | "cna_2" | "cna_3" | "savings";

export type SaaoFixture = {
  fiscalYear: number;
  nodes: {
    key: string;
    parentKey: string | null;
    kind: NodeKind;
    label: string;
    accountCode: string | null;
    classificationCode: string | null;
    sortOrder: number;
    appropriation: string;
  }[];
  movements: {
    key: string;
    kind: MovementKind;
    sbNumber: number | null;
    status: RecordStatus;
    effectiveDate: string;
    lines: { nodeKey: string; amount: string }[];
  }[];
  obligations: { nodeKey: string; month: number; amount: string }[];
  allotments: { nodeKey: string; amount: string; status: RecordStatus; date: string }[];
  extras: { nodeKey: string; field: ExtraField; mode: "balance" | "amount"; amount: string | null }[];
  contexts: {
    name: string;
    cutoff: string;
    allotmentMode: AllotmentMode;
    movementRule: MovementRule;
    expected: { lines: Record<string, LineAmounts>; totals: LineAmounts };
  }[];
};

export const basic = basicJson as unknown as SaaoFixture;

const CLASSIFICATION_NAMES: Record<string, string> = {
  PS: "Personal Services",
  MOOE: "Maintenance and Other Operating Expenses",
  CO: "Capital Outlay",
};

/** LineInput per line key, amounts converted to centavos. */
export function lineInputs(f: SaaoFixture): Record<string, LineInput> {
  const out: Record<string, LineInput> = {};
  for (const n of f.nodes) {
    if (n.kind !== "line") continue;
    out[n.key] = {
      appropriation: fromNumeric(n.appropriation),
      movements: [],
      obligations: [],
      allotments: [],
      extras: {},
    };
  }
  for (const m of f.movements) {
    for (const l of m.lines) {
      out[l.nodeKey].movements.push({
        kind: m.kind,
        sbNumber: m.sbNumber,
        status: m.status,
        effectiveDate: m.effectiveDate,
        amount: fromNumeric(l.amount),
      });
    }
  }
  for (const o of f.obligations) {
    out[o.nodeKey].obligations.push({ month: o.month, amount: fromNumeric(o.amount) });
  }
  for (const a of f.allotments) {
    out[a.nodeKey].allotments.push({ amount: fromNumeric(a.amount), status: a.status, date: a.date });
  }
  for (const e of f.extras) {
    out[e.nodeKey].extras[e.field] = {
      mode: e.mode,
      amount: e.amount === null ? null : fromNumeric(e.amount),
    };
  }
  return out;
}

/** Snapshot-shaped rows (tree order) carrying the given per-line amounts. */
export function reportRows(f: SaaoFixture, amountsByKey: Record<string, LineAmounts>): ReportRow[] {
  const seqByKey = new Map<string, number>();
  const depthByKey = new Map<string, number>();
  return f.nodes.map((n, i) => {
    const seq = i + 1;
    seqByKey.set(n.key, seq);
    const depth = n.parentKey === null ? 0 : depthByKey.get(n.parentKey)! + 1;
    depthByKey.set(n.key, depth);
    return {
      seq,
      parentSeq: n.parentKey === null ? null : seqByKey.get(n.parentKey)!,
      depth,
      kind: n.kind,
      nodeId: n.key,
      label: n.label,
      accountCode: n.accountCode,
      classificationCode: n.classificationCode,
      classificationName: n.classificationCode ? CLASSIFICATION_NAMES[n.classificationCode] ?? null : null,
      totalLabel: null,
      showTotal: true,
      amounts: n.kind === "line" ? amountsByKey[n.key] : null,
    };
  });
}
