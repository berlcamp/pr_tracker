// Paste from Excel (spec §8.4): parse the clipboard, plan the changes against the grid's
// targets for a preview, and turn the accepted changes into saao_apply_batch ops.
import { parseAmount, toPeso } from "./money";

export type PasteEditable = false | "label" | "code" | "appropriation" | "ref" | "sb" | "extra" | "obligation" | "movement_line";

export type PasteTarget = { rowKey: string; nodeId: string; colKey: string; editable: PasteEditable };

/**
 * One cell change. Column keys: `label`, `code`, `appropriation`, `appropriation_ref` (free text), `sb-<n>` (SB-n movement line),
 * `cna1` | `cna2` | `cna3` | `savings` (extras), `m<1..12>` (monthly obligation), `mv:<movementId>` (movement line).
 * Amount changes carry `centavos` (and `entry`, the typed expression or null). Extra changes carry
 * `entry: "balance"` for "= Balance of Allotment", `centavos` for an amount, or neither to clear.
 */
export type PasteChange = { nodeId: string; colKey: string; from: string; to: string; centavos?: number; entry?: string | null };
export type PasteError = { row: number; col: number; message: string };
export type PastePlan = { changes: PasteChange[]; errors: PasteError[]; skipped: number };

export const EXTRA_FIELDS = { cna1: "cna_1", cna2: "cna_2", cna3: "cna_3", savings: "savings" } as const;
export type ExtraField = (typeof EXTRA_FIELDS)[keyof typeof EXTRA_FIELDS];

export const ACCOUNT_CODE = /^\d-\d{2}-\d{2}-\d{3}$/;
export const ACCOUNT_CODE_MESSAGE = "Code must look like 5-02-03-010";
const BALANCE_WORDS = new Set(["b", "bal", "balance", "= balance", "=balance"]);
/** True for the words that tag an extra as "= Balance of Allotment" (R13). */
export const isBalanceWord = (text: string) => BALANCE_WORDS.has(text.trim().toLowerCase());

/** Excel-style TSV: tabs between cells, CR/LF between rows, `"…"` quoting (with `""` for a quote). */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let atCellStart = true;
  while (i < text.length) {
    const ch = text[i];
    if (atCellStart && ch === '"') {
      // quoted cell: runs to the closing quote; "" is a literal quote
      i++;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          i++;
          break;
        }
        cell += text[i++];
      }
      atCellStart = false;
      continue;
    }
    if (ch === "\t") { row.push(cell); cell = ""; atCellStart = true; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; atCellStart = true;
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += ch;
    atCellStart = false;
    i++;
  }
  // the last line has no terminator unless the text ends with a newline (then it is dropped)
  if (!atCellStart || row.length > 0 || cell !== "") { row.push(cell); rows.push(row); }
  return rows;
}

type CellPlan = { change: Omit<PasteChange, "nodeId" | "colKey" | "from" | "to"> | null } | { error: string };

function classifyExtra(text: string): { mode: "balance" } | { mode: "amount"; centavos: number } | { mode: null } | { error: string } {
  const t = text.trim().toLowerCase();
  if (t === "") return { mode: null };
  if (isBalanceWord(t)) return { mode: "balance" };
  const p = parseAmount(text);
  return p.ok ? { mode: "amount", centavos: p.centavos } : { error: p.error };
}

/** Plans one typed or pasted value for a cell; `change: null` means the value is unchanged. */
export function planCell(editable: Exclude<PasteEditable, false>, text: string, current: string): CellPlan {
  switch (editable) {
    case "label": {
      const v = text.trim();
      if (v === "") return { error: "A label is required" };
      return { change: v === current.trim() ? null : {} };
    }
    case "code": {
      const v = text.trim();
      if (v !== "" && !ACCOUNT_CODE.test(v)) return { error: ACCOUNT_CODE_MESSAGE };
      return { change: v === current.trim() ? null : {} };
    }
    case "ref":
      return { change: text.trim() === current.trim() ? null : {} };
    case "extra": {
      const next = classifyExtra(text);
      if ("error" in next) return { error: next.error };
      const cur = classifyExtra(current);
      const same = !("error" in cur) && cur.mode === next.mode
        && (next.mode !== "amount" || (cur.mode === "amount" && cur.centavos === next.centavos));
      if (same) return { change: null };
      if (next.mode === "balance") return { change: { entry: "balance" } };
      if (next.mode === "amount") return { change: { centavos: next.centavos, entry: null } };
      return { change: { entry: null } };
    }
    default: {
      const p = parseAmount(text);
      if (!p.ok) return { error: p.error };
      const cur = parseAmount(current);
      const unchanged = cur.ok && cur.centavos === p.centavos && (editable !== "obligation" || cur.entry === p.entry);
      return { change: unchanged ? null : { centavos: p.centavos, entry: p.entry } };
    }
  }
}

/**
 * Maps a pasted block onto `targets` (row-major, starting at the focused cell). Cells with no target
 * or a non-editable target are skipped and never produce a change.
 */
export function planPaste(
  cells: string[][],
  targets: PasteTarget[][],
  current: (nodeId: string, colKey: string) => string,
): PastePlan {
  const changes: PasteChange[] = [];
  const errors: PasteError[] = [];
  let skipped = 0;
  cells.forEach((line, r) => {
    line.forEach((text, c) => {
      const target = targets[r]?.[c];
      if (!target || !target.editable) { skipped++; return; }
      const from = current(target.nodeId, target.colKey);
      const plan = planCell(target.editable, text, from);
      if ("error" in plan) { errors.push({ row: r, col: c, message: plan.error }); return; }
      if (plan.change) changes.push({ nodeId: target.nodeId, colKey: target.colKey, from, to: text, ...plan.change });
    });
  });
  return { changes, errors, skipped };
}

export function sbNumberOfCol(colKey: string): number | null {
  const m = /^sb-(\d+)$/.exec(colKey);
  return m ? Number(m[1]) : null;
}

/** saao_apply_batch ops for planned changes. Amounts are sent as pesos, the RPCs' numeric unit. */
export function changesToOps(changes: PasteChange[], ctx: { sbMovementIds: Record<string, string>; bookId: string }): unknown[] {
  return changes.map((ch) => {
    const amount = () => toPeso(ch.centavos ?? 0);
    if (ch.colKey === "label") return { op: "update_node", id: ch.nodeId, patch: { label: ch.to.trim() } };
    if (ch.colKey === "code") return { op: "update_node", id: ch.nodeId, patch: { account_code: ch.to.trim() || null } };
    if (ch.colKey === "appropriation") return { op: "update_node", id: ch.nodeId, patch: { appropriation: amount() } };
    if (ch.colKey === "appropriation_ref") return { op: "update_node", id: ch.nodeId, patch: { appropriation_ref: ch.to.trim() || null } };
    const sb = sbNumberOfCol(ch.colKey);
    if (sb !== null) {
      const movementId = ctx.sbMovementIds[String(sb)];
      if (!movementId) throw new Error(`SB-${sb} does not exist yet`);
      return { op: "movement_line", movement_id: movementId, node_id: ch.nodeId, amount: amount() };
    }
    if (ch.colKey.startsWith("mv:")) {
      return { op: "movement_line", movement_id: ch.colKey.slice(3), node_id: ch.nodeId, amount: amount() };
    }
    const month = /^m(\d{1,2})$/.exec(ch.colKey);
    if (month) return { op: "obligation", node_id: ch.nodeId, month: Number(month[1]), amount: amount(), entry: ch.entry ?? null };
    if (ch.colKey in EXTRA_FIELDS) {
      const field = EXTRA_FIELDS[ch.colKey as keyof typeof EXTRA_FIELDS];
      if (ch.entry === "balance") return { op: "extra", node_id: ch.nodeId, field, mode: "balance", amount: null };
      if (ch.centavos !== undefined) return { op: "extra", node_id: ch.nodeId, field, mode: "amount", amount: amount() };
      return { op: "extra", node_id: ch.nodeId, field, mode: null, amount: null };
    }
    throw new Error(`Column ${ch.colKey} cannot be pasted into`);
  });
}
