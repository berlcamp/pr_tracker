import { initialMonth } from "@/lib/saao/cutoff";
import { getEditorData } from "@/lib/saao/queries";
import { first, loadDataBook, NoBook } from "../data-book";
import { ObligationsGrid } from "./obligations-grid";

type Props = { searchParams: Promise<{ month?: string | string[]; line?: string | string[] }> };

export default async function ObligationsPage({ searchParams }: Props) {
  const { role, book } = await loadDataBook();
  if (!book) return <NoBook title="Obligations" role={role} />;
  const sp = await searchParams;
  const data = await getEditorData(book.id);
  return (
    <ObligationsGrid key={book.id} book={book} data={data} initialMonth={initialMonth(sp.month, book.fiscalYear)}
      initialLine={first(sp.line) ?? null} />
  );
}
