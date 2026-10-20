"use client";
// Excel-like grid for the SAAO workspace (spec §8.3). Cells are plain text; only the active cell
// renders an <input> while editing. Rows are memoised and keyed by node id, so moving the
// selection re-renders two rows and typing re-renders only the editor.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DisplayRow } from "@/lib/saao/rollup";
import type { PasteEditable } from "@/lib/saao/paste";
import { cn } from "@/lib/utils";

export type GridColumn = { key: string; header: string; numeric: boolean };
export type CellKind = { editable: PasteEditable; href?: string };
export type CellPos = { rowKey: string; colKey: string };
export type FocusRequest = CellPos & { edit: boolean; nonce: number };

/** Stable row key: the node id, `t:<node id>` for a subtotal, `grand` for the grand total. */
export function rowKeyOf(r: DisplayRow): string {
  if (r.type === "grand") return "grand";
  const id = r.row.nodeId ?? `seq-${r.row.seq}`;
  return r.type === "subtotal" ? `t:${id}` : id;
}

type Editing = { initial: string; caret: boolean; selectAll?: boolean };

type Props = {
  rows: DisplayRow[];
  columns: GridColumn[];
  /** Display text; must be a stable function of (row, column). */
  cellText: (row: DisplayRow, col: GridColumn) => string;
  /** Editability and link target; must be a stable function of (row, column key). */
  cellKind: (row: DisplayRow, colKey: string) => CellKind;
  /** Text the editor starts with when editing is entered with Enter or F2. */
  editText: (nodeId: string, colKey: string) => string;
  /** Validates and saves a typed value. Returns false to keep the editor open (the caller shows why). */
  onCommit: (nodeId: string, colKey: string, text: string) => boolean;
  onPaste: (anchor: CellPos, text: string) => void;
  renderMenu?: (row: DisplayRow, open: boolean, setOpen: (open: boolean) => void, focusGrid: () => void) => ReactNode;
  focusRequest?: FocusRequest | null;
  emptyMessage?: ReactNode;
};

const PAGE = 20;
const DESCRIPTION_WIDTH = 384;
const HEADER_HEIGHT = 32;
/** Fixed column widths: with table-layout fixed, moving the selection never re-lays out ~30k cells. */
const widthOf = (c: GridColumn, i: number) => (i === 0 ? DESCRIPTION_WIDTH : c.key === "code" ? 104 : c.key === "pct" ? 72 : c.numeric ? 136 : 160);

export function EditableGrid({
  rows, columns, cellText, cellKind, editText, onCommit, onPaste, renderMenu, focusRequest, emptyMessage,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<CellPos | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // the row whose StructureMenu is mounted (it stays mounted while that row is active, so its dialogs survive the menu closing)
  const [menu, setMenu] = useState<{ rowKey: string; open: boolean } | null>(null);
  const lastCommitOk = useRef(true);

  const keys = useMemo(() => rows.map(rowKeyOf), [rows]);
  const indexOfKey = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);
  const colIndex = useMemo(() => new Map(columns.map((c, i) => [c.key, i])), [columns]);

  // the active cell survives re-renders by key; when its row disappears (deleted, filtered out) nothing is active until the next key or click
  const pos = useMemo(() => {
    if (!active || rows.length === 0) return null;
    const ri = indexOfKey.get(active.rowKey);
    const ci = colIndex.get(active.colKey) ?? 0;
    return ri === undefined ? null : { ri, ci };
  }, [active, indexOfKey, colIndex, rows.length]);

  const focusGrid = useCallback(() => containerRef.current?.focus({ preventScroll: true }), []);

  const moveTo = useCallback((ri: number, ci: number) => {
    if (rows.length === 0) return;
    const r = Math.max(0, Math.min(rows.length - 1, ri));
    const c = Math.max(0, Math.min(columns.length - 1, ci));
    setActive({ rowKey: keys[r], colKey: columns[c].key });
    setEditing(null);
    setMenu((m) => (m && m.rowKey === keys[r] ? (m.open ? { ...m, open: false } : m) : null));
  }, [rows.length, columns, keys]);

  // keep the active cell in view below the sticky header and right of the sticky Description column.
  // Manual scrolling: scrollIntoView forces a full layout of the ~30k-cell table on every move.
  useEffect(() => {
    const box = containerRef.current;
    if (!active || !box) return;
    const el = box.querySelector<HTMLElement>(`td[data-row="${active.rowKey}"][data-col="${active.colKey}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const top = b.top + HEADER_HEIGHT, bottom = b.top + box.clientHeight;
    if (r.top < top) box.scrollTop -= top - r.top;
    else if (r.bottom > bottom) box.scrollTop += r.bottom - bottom;
    if (el.dataset.col !== columns[0]?.key) {
      const left = b.left + DESCRIPTION_WIDTH, right = b.left + box.clientWidth;
      if (r.left < left) box.scrollLeft -= left - r.left;
      else if (r.right > right) box.scrollLeft += r.right - right;
    }
  }, [active, columns]);

  // focus requests (e.g. a row just added) wait until the row arrives from the server
  const [handledFocus, setHandledFocus] = useState<number | null>(null);
  if (focusRequest && focusRequest.nonce !== handledFocus && indexOfKey.has(focusRequest.rowKey)) {
    const r = rows[indexOfKey.get(focusRequest.rowKey)!];
    setHandledFocus(focusRequest.nonce);
    setActive({ rowKey: focusRequest.rowKey, colKey: focusRequest.colKey });
    setMenu(null);
    setEditing(focusRequest.edit && r.row.nodeId && cellKind(r, focusRequest.colKey).editable
      ? { initial: editText(r.row.nodeId, focusRequest.colKey), caret: true, selectAll: true }
      : null);
  }

  const startEdit = useCallback((initial: string | null) => {
    if (!pos) return;
    const r = rows[pos.ri];
    const colKey = columns[pos.ci].key;
    const kind = cellKind(r, colKey);
    if (!kind.editable || !r.row.nodeId) {
      if (initial === null && kind.href) router.push(kind.href);
      return;
    }
    setEditing(initial === null ? { initial: editText(r.row.nodeId, colKey), caret: true } : { initial, caret: false });
  }, [pos, rows, columns, cellKind, editText, router]);

  /** Commits the editor; `move` is applied only when the value was accepted. */
  const commit = useCallback((text: string, move: [number, number] | null): boolean => {
    if (!pos) return true;
    const r = rows[pos.ri];
    const ok = r.row.nodeId ? onCommit(r.row.nodeId, columns[pos.ci].key, text) : true;
    lastCommitOk.current = ok;
    if (!ok) return false;
    setEditing(null);
    if (move) moveTo(pos.ri + move[0], pos.ci + move[1]);
    focusGrid();
    return true;
  }, [pos, rows, columns, onCommit, moveTo, focusGrid]);

  const cancel = useCallback(() => { setEditing(null); focusGrid(); }, [focusGrid]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // ignore keys from portalled dialogs/menus (React bubbles them here) and from inputs
    const target = e.target as HTMLElement;
    if (!containerRef.current?.contains(target) || target.closest("input, textarea, select, [role=menu]")) return;
    if (editing) return;
    if (!pos) {
      if (rows.length && /^(Arrow|Tab|Enter|Home|End|Page)/.test(e.key)) { e.preventDefault(); moveTo(0, 0); }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const { ri, ci } = pos;
    const r = rows[ri];
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); moveTo(mod ? 0 : ri - 1, ci); return;
      case "ArrowDown": e.preventDefault(); moveTo(mod ? rows.length - 1 : ri + 1, ci); return;
      case "ArrowLeft": e.preventDefault(); moveTo(ri, mod ? 0 : ci - 1); return;
      case "ArrowRight": e.preventDefault(); moveTo(ri, mod ? columns.length - 1 : ci + 1); return;
      case "Tab": e.preventDefault(); moveTo(ri, ci + (e.shiftKey ? -1 : 1)); return;
      case "Home": e.preventDefault(); moveTo(mod ? 0 : ri, 0); return;
      case "End": e.preventDefault(); moveTo(mod ? rows.length - 1 : ri, columns.length - 1); return;
      case "PageUp": e.preventDefault(); moveTo(ri - PAGE, ci); return;
      case "PageDown": e.preventDefault(); moveTo(ri + PAGE, ci); return;
      case "Enter": case "F2": e.preventDefault(); startEdit(null); return;
      case "Escape": return;
      case "Backspace": e.preventDefault(); startEdit(""); return;
      case "Delete": {
        e.preventDefault();
        const colKey = columns[ci].key;
        if (r.row.nodeId && cellKind(r, colKey).editable) onCommit(r.row.nodeId, colKey, "");
        return;
      }
      case "ContextMenu": e.preventDefault(); openMenu(ri); return;
    }
    if (e.key === "F10" && e.shiftKey) { e.preventDefault(); openMenu(ri); return; }
    if (mod && e.key.toLowerCase() === "c") {
      void navigator.clipboard?.writeText(cellText(r, columns[ci]));
      return;
    }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(e.key); }
  }

  function onPasteEvent(e: React.ClipboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (editing || !pos || !containerRef.current?.contains(target) || target.closest("input, textarea")) return;
    e.preventDefault();
    onPaste({ rowKey: keys[pos.ri], colKey: columns[pos.ci].key }, e.clipboardData.getData("text/plain"));
  }

  function cellFromEvent(e: React.MouseEvent): { ri: number; ci: number } | null {
    const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-row]");
    if (!td) return null;
    const ri = indexOfKey.get(td.dataset.row!);
    const ci = colIndex.get(td.dataset.col!);
    return ri === undefined || ci === undefined ? null : { ri, ci };
  }

  function openMenu(ri: number) {
    if (renderMenu && rows[ri]?.type === "node") setMenu({ rowKey: keys[ri], open: true });
  }

  function onMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-row-menu]")) {
      // the lightweight per-row button: select the row and open its menu
      const c = cellFromEvent(e);
      if (c && !editing) { e.preventDefault(); moveTo(c.ri, 0); openMenu(c.ri); focusGrid(); }
      return;
    }
    if (target.closest("input, a, button")) return;
    const c = cellFromEvent(e);
    if (!c) return;
    if (editing) {
      if (pos && c.ri === pos.ri && c.ci === pos.ci) return;
      // clicking another cell commits the open editor first (its blur handler saves); stay when it is invalid
      lastCommitOk.current = true;
      containerRef.current?.querySelector<HTMLInputElement>("td input")?.blur();
      if (!lastCommitOk.current) { e.preventDefault(); return; }
    }
    moveTo(c.ri, c.ci);
  }

  function onDoubleClick(e: React.MouseEvent) {
    const c = cellFromEvent(e);
    if (c && pos && c.ri === pos.ri && c.ci === pos.ci && !editing) startEdit(null);
  }

  function onContextMenu(e: React.MouseEvent) {
    const c = cellFromEvent(e);
    if (!c || rows[c.ri].type !== "node" || !renderMenu) return;
    e.preventDefault();
    moveTo(c.ri, c.ci);
    openMenu(c.ri);
  }

  const tableWidth = useMemo(() => columns.reduce((s, c, i) => s + widthOf(c, i), 0), [columns]);
  const activeKey = pos ? keys[pos.ri] : null;
  const activeCol = pos ? columns[pos.ci].key : null;

  const editorApi = useMemo(() => ({ commit, cancel }), [commit, cancel]);
  const setMenuOpen = useCallback((open: boolean) => setMenu((m) => (m ? { ...m, open } : m)), []);
  const menuApi = useMemo(() => ({ setMenuOpen, focusGrid }), [setMenuOpen, focusGrid]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="SAAO workspace grid"
      onKeyDown={onKeyDown}
      onPaste={onPasteEvent}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="max-h-[calc(100vh-15rem)] min-h-64 overflow-auto rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <table role="grid" aria-label="SAAO workspace" aria-rowcount={rows.length} className="table-fixed border-separate border-spacing-0 text-xs" style={{ width: tableWidth }}>
        <colgroup>{columns.map((c, i) => <col key={c.key} style={{ width: widthOf(c, i) }} />)}</colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col"
                className={cn(
                  "sticky top-0 z-20 h-8 border-b bg-muted px-2 text-left font-semibold whitespace-nowrap",
                  i === 0 && "left-0 z-30",
                  c.numeric && "text-right",
                )}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyMessage ?? "No rows."}</td></tr>
          )}
          {rows.map((r, i) => {
            const key = keys[i];
            const isActive = key === activeKey;
            return (
              <GridRow key={key} rowKey={key} row={r} columns={columns} cellText={cellText} cellKind={cellKind}
                activeCol={isActive ? activeCol : null} editing={isActive ? editing : null} editorApi={isActive ? editorApi : null}
                menu={menu?.rowKey === key && renderMenu && r.type === "node" ? { render: renderMenu, open: menu.open, api: menuApi } : null} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type RowProps = {
  rowKey: string;
  row: DisplayRow;
  columns: GridColumn[];
  cellText: Props["cellText"];
  cellKind: Props["cellKind"];
  activeCol: string | null;
  editing: Editing | null;
  editorApi: { commit: (text: string, move: [number, number] | null) => boolean; cancel: () => void } | null;
  menu: { render: NonNullable<Props["renderMenu"]>; open: boolean; api: { setMenuOpen: (o: boolean) => void; focusGrid: () => void } } | null;
};

const GridRow = memo(function GridRow({ rowKey, row, columns, cellText, cellKind, activeCol, editing, editorApi, menu }: RowProps) {
  const isNode = row.type === "node";
  const heading = isNode && row.row.kind !== "line" && row.row.kind !== "note";
  const tone = row.type === "grand" ? "font-bold bg-muted" : row.type === "subtotal" ? "font-semibold bg-muted/60" : "";
  return (
    <tr className={cn("group/row h-7", tone, heading && "font-medium", row.type === "grand" && "[&>td]:border-t-2")}>
      {columns.map((c, i) => {
        const kind = cellKind(row, c.key);
        const isActive = activeCol === c.key;
        const text = cellText(row, c);
        const calculated = isNode && row.row.kind === "line" && c.numeric && !kind.editable;
        return (
          <td key={c.key} data-row={rowKey} data-col={c.key} data-active={isActive || undefined} title={i === 0 && text.length > 40 ? text : undefined}
            className={cn(
              "group/cell relative h-7 overflow-hidden border-b px-2 text-ellipsis whitespace-nowrap",
              i === 0
                ? cn("sticky left-0 z-10", row.type === "node" ? "bg-background" : "bg-muted")
                : "",
              c.numeric && "text-right tabular-nums",
              c.key === "code" && "text-muted-foreground",
              calculated && "bg-muted/30 text-muted-foreground",
              row.row.kind === "note" && isNode && "italic text-muted-foreground",
              isActive && "outline-2 -outline-offset-2 outline-primary",
            )}
            style={i === 0 ? { paddingLeft: 8 + row.depth * 14 } : undefined}>
            {isActive && editing && editorApi ? (
              <CellEditor initial={editing.initial} caret={editing.caret} selectAll={!!editing.selectAll} numeric={c.numeric} api={editorApi} />
            ) : kind.href && text !== "" ? (
              <Link href={kind.href} prefetch={false} className="underline decoration-dotted underline-offset-2 hover:text-primary" tabIndex={-1}>{text}</Link>
            ) : (
              text
            )}
            {i === 0 && menu && (
              <span className="absolute top-0.5 right-0.5 bg-background">{menu.render(row, menu.open, menu.api.setMenuOpen, menu.api.focusGrid)}</span>
            )}
            {i === 0 && isNode && !menu && (
              // plain text button (no handlers; the grid's mousedown delegate opens the real menu); shown on hover or when the cell is active
              <button type="button" data-row-menu tabIndex={-1} aria-label={`Row actions for ${row.label}`}
                className="absolute top-0.5 right-0.5 flex size-6 items-center justify-center rounded bg-background text-muted-foreground opacity-0 group-hover/row:opacity-100 group-data-active/cell:opacity-100 hover:bg-muted">
                &#8942;
              </button>
            )}
          </td>
        );
      })}
    </tr>
  );
});

function CellEditor({ initial, caret, selectAll, numeric, api }: {
  initial: string; caret: boolean; selectAll: boolean; numeric: boolean;
  api: NonNullable<RowProps["editorApi"]>;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (selectAll) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [selectAll]);

  const finish = (move: [number, number] | null) => {
    if (done.current) return;
    done.current = true;
    if (!api.commit(value, move)) done.current = false;
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    switch (e.key) {
      case "Enter": e.preventDefault(); finish([e.shiftKey ? -1 : 1, 0]); return;
      case "Tab": e.preventDefault(); finish([0, e.shiftKey ? -1 : 1]); return;
      case "Escape": e.preventDefault(); done.current = true; api.cancel(); return;
    }
    // editing started by typing: arrows commit and move, as in Excel; after Enter/F2 they move the caret
    if (!caret) {
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const m = moves[e.key];
      if (m) { e.preventDefault(); finish(m); }
    }
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(null)}
      aria-label="Cell value"
      spellCheck={false}
      className={cn(
        "absolute inset-0 z-20 h-full w-full border-0 bg-background px-2 text-xs outline-2 -outline-offset-2 outline-primary",
        numeric && "text-right tabular-nums",
      )}
    />
  );
}
