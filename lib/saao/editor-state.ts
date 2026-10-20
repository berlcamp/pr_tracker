// Client-side state for the SAAO workspace: live rows from the book's raw data (mirroring
// pr_tracker._saao_tree_rows + saao_compute_lines) and optimistic local edits.
import { computeLine, type CalcContext, type LineInput } from "./calc";
import { fromNumeric, toPeso } from "./money";
import { EXTRA_FIELDS, sbNumberOfCol, type ExtraField, type PasteChange } from "./paste";
import type { EditorData } from "./queries";
import type { MovementKind, NodeKind, RecordStatus, ReportRow } from "./types";

type Node = EditorData["nodes"][number];

export type LocalEdit =
  | { kind: "node"; id: string; patch: Partial<Pick<Node, "label" | "account_code">> }
  | { kind: "appropriation"; nodeId: string; centavos: number }
  | { kind: "movement_line"; movementId: string; nodeId: string; centavos: number }
  | { kind: "extra"; nodeId: string; field: ExtraField; mode: "balance" | "amount" | null; centavos: number | null }
  | { kind: "obligation"; nodeId: string; month: number; centavos: number; entry: string | null };

/** R-A: sort_order, then created_at, then id. */
export function compareNodes(a: Node, b: Node): number {
  return a.sort_order - b.sort_order || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Active children per parent id ("" = top level), in tree order. Inactive nodes are left out with their subtrees. */
export function childrenIndex(nodes: Node[]): Map<string, Node[]> {
  const out = new Map<string, Node[]>();
  for (const n of nodes) {
    if (!n.active) continue;
    const k = n.parent_id ?? "";
    const list = out.get(k);
    if (list) list.push(n);
    else out.set(k, [n]);
  }
  for (const list of out.values()) list.sort(compareNodes);
  return out;
}

const emptyInput = (appropriation: number): LineInput => ({ appropriation, movements: [], obligations: [], allotments: [], extras: {} });

function lineInputs(data: EditorData): Map<string, LineInput> {
  const inputs = new Map<string, LineInput>();
  for (const n of data.nodes) if (n.kind === "line") inputs.set(n.id, emptyInput(fromNumeric(n.appropriation)));
  for (const m of data.movements) {
    for (const l of m.lines) {
      inputs.get(l.node_id)?.movements.push({
        kind: m.kind as MovementKind, sbNumber: m.sb_number, status: m.status as RecordStatus,
        effectiveDate: m.effective_date, amount: fromNumeric(l.amount),
      });
    }
  }
  for (const o of data.obligations) inputs.get(o.node_id)?.obligations.push({ month: o.month, amount: fromNumeric(o.amount) });
  for (const a of data.allotments) {
    // an undated allotment never counts (SQL: allotment_date <= cutoff is null)
    inputs.get(a.node_id)?.allotments.push({ amount: fromNumeric(a.amount), status: a.status as RecordStatus, date: a.allotment_date ?? "9999-12-31" });
  }
  for (const e of data.extras) {
    const input = inputs.get(e.node_id);
    if (input) input.extras[e.field as ExtraField] = { mode: e.mode as "balance" | "amount", amount: e.amount === null ? null : fromNumeric(e.amount) };
  }
  return inputs;
}

/**
 * Snapshot-shaped rows for the live book, one per active node in DFS tree order, with line amounts
 * from calc.computeLine. Classification is the effective one: a classification node's own; a line's
 * own or else the nearest classification ancestor; any other node's nearest classification ancestor.
 */
export function buildEditorRows(data: EditorData, ctx: CalcContext): ReportRow[] {
  const children = childrenIndex(data.nodes);
  const cls = new Map(data.classifications.map((c) => [c.id, c]));
  const inputs = lineInputs(data);
  const rows: ReportRow[] = [];

  const walk = (parentId: string, parentSeq: number | null, depth: number, inheritedCls: string | null) => {
    for (const n of children.get(parentId) ?? []) {
      const seq = rows.length + 1;
      const effective = n.kind === "classification" ? n.classification_id
        : n.kind === "line" ? n.classification_id ?? inheritedCls : inheritedCls;
      const c = effective ? cls.get(effective) : undefined;
      rows.push({
        seq, parentSeq, depth, kind: n.kind as NodeKind, nodeId: n.id, label: n.label, accountCode: n.account_code,
        classificationCode: c?.code ?? null, classificationName: c?.name ?? null,
        totalLabel: n.total_label, showTotal: n.show_total,
        amounts: n.kind === "line" ? computeLine(inputs.get(n.id) ?? emptyInput(0), ctx) : null,
      });
      walk(n.id, seq, depth + 1, n.kind === "classification" ? n.classification_id : inheritedCls);
    }
  };
  walk("", null, 0, null);
  return rows;
}

/** Optimistic update of the raw data; returns a new object and never mutates the input. Amounts are stored as pesos, like the DB rows. */
export function applyLocalEdit(data: EditorData, edit: LocalEdit): EditorData {
  switch (edit.kind) {
    case "node":
      return { ...data, nodes: data.nodes.map((n) => (n.id === edit.id ? { ...n, ...edit.patch } : n)) };
    case "appropriation":
      return { ...data, nodes: data.nodes.map((n) => (n.id === edit.nodeId ? { ...n, appropriation: toPeso(edit.centavos) } : n)) };
    case "movement_line":
      return {
        ...data,
        movements: data.movements.map((m) => {
          if (m.id !== edit.movementId) return m;
          const rest = m.lines.filter((l) => l.node_id !== edit.nodeId);
          if (edit.centavos === 0) return { ...m, lines: rest };
          const old = m.lines.find((l) => l.node_id === edit.nodeId);
          const line = old ? { ...old, amount: toPeso(edit.centavos) }
            : { id: `local-${m.id}-${edit.nodeId}`, movement_id: m.id, node_id: edit.nodeId, amount: toPeso(edit.centavos) } as typeof m.lines[number];
          return { ...m, lines: [...rest, line] };
        }),
      };
    case "extra": {
      const rest = data.extras.filter((e) => !(e.node_id === edit.nodeId && e.field === edit.field));
      if (edit.mode === null) return { ...data, extras: rest };
      const row = {
        node_id: edit.nodeId, field: edit.field, mode: edit.mode,
        amount: edit.mode === "amount" && edit.centavos !== null ? toPeso(edit.centavos) : null,
      } as EditorData["extras"][number];
      return { ...data, extras: [...rest, row] };
    }
    case "obligation": {
      const rest = data.obligations.filter((o) => !(o.node_id === edit.nodeId && o.month === edit.month));
      if (edit.centavos === 0 && edit.entry === null) return { ...data, obligations: rest };
      const old = data.obligations.find((o) => o.node_id === edit.nodeId && o.month === edit.month);
      const row = { ...(old ?? {}), node_id: edit.nodeId, month: edit.month, amount: toPeso(edit.centavos), entry: edit.entry } as EditorData["obligations"][number];
      return { ...data, obligations: [...rest, row] };
    }
  }
}

/** The optimistic edit for one planned grid change (see PasteChange for the column keys). */
export function editFromChange(ch: PasteChange, sbMovementIds: Record<string, string>): LocalEdit {
  if (ch.colKey === "label") return { kind: "node", id: ch.nodeId, patch: { label: ch.to.trim() } };
  if (ch.colKey === "code") return { kind: "node", id: ch.nodeId, patch: { account_code: ch.to.trim() || null } };
  if (ch.colKey === "appropriation") return { kind: "appropriation", nodeId: ch.nodeId, centavos: ch.centavos ?? 0 };
  const sb = sbNumberOfCol(ch.colKey);
  if (sb !== null) {
    const movementId = sbMovementIds[String(sb)];
    if (!movementId) throw new Error(`SB-${sb} does not exist yet`);
    return { kind: "movement_line", movementId, nodeId: ch.nodeId, centavos: ch.centavos ?? 0 };
  }
  if (ch.colKey.startsWith("mv:")) return { kind: "movement_line", movementId: ch.colKey.slice(3), nodeId: ch.nodeId, centavos: ch.centavos ?? 0 };
  const month = /^m(\d{1,2})$/.exec(ch.colKey);
  if (month) return { kind: "obligation", nodeId: ch.nodeId, month: Number(month[1]), centavos: ch.centavos ?? 0, entry: ch.entry ?? null };
  if (ch.colKey in EXTRA_FIELDS) {
    const field = EXTRA_FIELDS[ch.colKey as keyof typeof EXTRA_FIELDS];
    if (ch.entry === "balance") return { kind: "extra", nodeId: ch.nodeId, field, mode: "balance", centavos: null };
    if (ch.centavos !== undefined) return { kind: "extra", nodeId: ch.nodeId, field, mode: "amount", centavos: ch.centavos };
    return { kind: "extra", nodeId: ch.nodeId, field, mode: null, centavos: null };
  }
  throw new Error(`Column ${ch.colKey} cannot be edited`);
}
