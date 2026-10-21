import { buildEditorRows } from "@/lib/saao/editor-state";
import { lineOptions } from "@/lib/saao/line-options";
import { fromNumeric } from "@/lib/saao/money";
import { summarizeMovement } from "@/lib/saao/movement-summary";
import { getEditorData } from "@/lib/saao/queries";
import type { MovementKind, RecordStatus } from "@/lib/saao/types";
import { first, loadDataBook, NoBook } from "../data-book";
import { MovementsTable, type MovementItem } from "./movements-table";

type Props = { searchParams: Promise<{ line?: string | string[] }> };

export default async function MovementsPage({ searchParams }: Props) {
  const { role, book } = await loadDataBook();
  if (!book) return <NoBook title="Budget Movements" role={role} />;
  const lineId = first((await searchParams).line) ?? null;
  const data = await getEditorData(book.id);

  const items: MovementItem[] = data.movements
    .filter((m) => !lineId || m.lines.some((l) => l.node_id === lineId))
    .map((m) => ({
      id: m.id, bookId: m.book_id, kind: m.kind as MovementKind, sbNumber: m.sb_number, referenceNo: m.reference_no, title: m.title,
      effectiveDate: m.effective_date, status: m.status as RecordStatus, statusNote: m.status_note, remarks: m.remarks,
      ...summarizeMovement(m.lines.map((l) => ({ amount: fromNumeric(l.amount) }))), lineCount: m.lines.length,
    }));

  let line: { id: string; path: string | null } | null = null;
  if (lineId) {
    const rows = buildEditorRows(data, { cutoff: `${book.fiscalYear}-12-31`, allotmentMode: book.allotmentMode, movementRule: book.movementRule });
    line = { id: lineId, path: lineOptions(rows).find((o) => o.id === lineId)?.path ?? null };
  }

  return <MovementsTable key={book.id} movements={items} rule={book.movementRule} line={line} />;
}
