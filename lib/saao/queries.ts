import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  SaaoAllotmentRow, SaaoBookRow, SaaoLineExtraRow, SaaoMovementLineRow, SaaoMovementRow, SaaoNodeRow,
  SaaoObligationRow, SaaoReportRow,
} from "@/lib/supabase/rows";
import { fromNumeric } from "./money";
import type { LineAmounts, NodeKind, ReportRow } from "./types";

type Num = string | number | null;
type Json = Record<string, unknown>;

const num = (v: unknown) => fromNumeric(v as Num);

/** Maps a snapshot row / saao_live_rows element (snake_case, numerics as string or number) to a ReportRow in centavos. */
export function toReportRow(json: unknown): ReportRow {
  const r = json as Json;
  const isLine = r.kind === "line";
  const sbIn = (r.sb ?? {}) as Record<string, Num>;
  const monthsIn = (Array.isArray(r.months) ? r.months : []) as Num[];
  const amounts: LineAmounts | null = isLine
    ? {
        appropriation: num(r.appropriation), nta: num(r.nta),
        sb: Object.fromEntries(Object.entries(sbIn).map(([k, v]) => [k, fromNumeric(v)])),
        supplemental: num(r.supplemental), realignment: num(r.realignment), totalChanges: num(r.total_changes),
        adjusted: num(r.adjusted), allotment: num(r.allotment), obligation: num(r.obligation),
        months: Array.from({ length: 12 }, (_, i) => fromNumeric(monthsIn[i] ?? 0)),
        balanceAppropriation: num(r.balance_appropriation), balanceAllotment: num(r.balance_allotment),
        cna1: num(r.cna_1), cna2: num(r.cna_2), cna3: num(r.cna_3), savings: num(r.savings), savingsHalf: num(r.savings_half),
      }
    : null;
  return {
    seq: Number(r.seq), parentSeq: r.parent_seq == null ? null : Number(r.parent_seq), depth: Number(r.depth),
    kind: r.kind as NodeKind, nodeId: (r.node_id as string | null) ?? null, label: String(r.label),
    accountCode: (r.account_code as string | null) ?? null,
    classificationCode: (r.classification_code as string | null) ?? null,
    classificationName: (r.classification_name as string | null) ?? null,
    totalLabel: (r.total_label as string | null) ?? null, showTotal: Boolean(r.show_total), amounts,
  };
}

/** Books, newest fiscal year first. */
export const listBooks = cache(async (): Promise<(SaaoBookRow & { fund: { code: string; name: string } | null })[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saao_books").select("*, fund:saao_funds(code, name)")
    .order("fiscal_year", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export async function getBook(id: string): Promise<SaaoBookRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saao_books").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listReports(bookId?: string): Promise<SaaoReportRow[]> {
  const supabase = await createClient();
  let q = supabase.from("saao_reports").select("*").order("cutoff_date", { ascending: false }).order("version", { ascending: false });
  if (bookId) q = q.eq("book_id", bookId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getReport(id: string): Promise<SaaoReportRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saao_reports").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Snapshot rows of a report in tree order. */
export async function getReportRows(reportId: string): Promise<ReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saao_report_rows").select("*").eq("report_id", reportId).order("seq");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toReportRow);
}

/** Live computation for a book at a cutoff date (YYYY-MM-DD). */
export async function getLiveRows(bookId: string, cutoff: string): Promise<ReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("saao_live_rows", { p_book_id: bookId, p_cutoff: cutoff });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map(toReportRow);
}

export type EditorData = {
  nodes: SaaoNodeRow[];
  movements: (SaaoMovementRow & { lines: SaaoMovementLineRow[] })[];
  obligations: SaaoObligationRow[];
  allotments: SaaoAllotmentRow[];
  extras: SaaoLineExtraRow[];
};

/** Everything the editor and calc.ts need for one book. Nodes are in tree order (sort_order, created_at, id). */
export async function getEditorData(bookId: string): Promise<EditorData> {
  const supabase = await createClient();
  const nodesRes = await supabase.from("saao_nodes").select("*").eq("book_id", bookId)
    .order("sort_order").order("created_at").order("id");
  const movRes = await supabase.from("saao_movements").select("*, lines:saao_movement_lines(*)").eq("book_id", bookId)
    .order("effective_date").order("created_at");
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  if (movRes.error) throw new Error(movRes.error.message);
  const nodes = nodesRes.data ?? [];
  const ids = nodes.map((n) => n.id);
  // Chunk the id list so the request URL stays small for large books.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const [obl, alt, ext] = await Promise.all([
    Promise.all(chunks.map((c) => supabase.from("saao_obligations").select("*").in("node_id", c))),
    Promise.all(chunks.map((c) => supabase.from("saao_allotments").select("*").in("node_id", c).order("created_at"))),
    Promise.all(chunks.map((c) => supabase.from("saao_line_extras").select("*").in("node_id", c))),
  ]);
  for (const res of [...obl, ...alt, ...ext]) if (res.error) throw new Error(res.error.message);
  return {
    nodes,
    movements: movRes.data ?? [],
    obligations: obl.flatMap((r) => r.data ?? []),
    allotments: alt.flatMap((r) => r.data ?? []),
    extras: ext.flatMap((r) => r.data ?? []),
  };
}
