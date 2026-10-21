import Link from "next/link";
import { notFound } from "next/navigation";
import { getEditorData } from "@/lib/saao/queries";
import type { MovementKind, RecordStatus } from "@/lib/saao/types";
import { loadDataBook, NoBook } from "../../data-book";
import { MovementForm, type MovementFields } from "./movement-form";
import { MovementLinesGrid } from "./movement-lines-grid";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MovementPage({ params }: Props) {
  const { role, book } = await loadDataBook();
  if (!book) return <NoBook title="Budget Movement" role={role} />;
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();
  const data = await getEditorData(book.id);
  const m = isNew ? null : data.movements.find((x) => x.id === id);
  if (m === undefined) notFound();

  const nextSb = Math.max(0, ...data.movements.map((x) => x.sb_number ?? 0)) + 1;
  const fields: MovementFields | null = m && {
    id: m.id, kind: m.kind as MovementKind, sbNumber: m.sb_number, referenceNo: m.reference_no, title: m.title,
    effectiveDate: m.effective_date, status: m.status as RecordStatus, statusNote: m.status_note, remarks: m.remarks,
  };

  return (
    <div className="space-y-4">
      <Link href="/budget/data/movements" className="text-sm text-muted-foreground underline">&larr; Budget Movements</Link>
      <MovementForm key={m?.id ?? "new"} book={book} movement={fields} nextSb={nextSb} lineCount={m?.lines.length ?? 0} />
      {m && <MovementLinesGrid key={m.id} book={book} movementId={m.id} kind={m.kind as MovementKind} data={data} />}
    </div>
  );
}
