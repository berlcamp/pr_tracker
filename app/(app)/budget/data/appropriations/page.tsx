import { initialMonth } from "@/lib/saao/cutoff";
import { getEditorData } from "@/lib/saao/queries";
import { loadDataBook, NoBook } from "../data-book";
import { AppropriationsGrid } from "./appropriations-grid";

type Props = { searchParams: Promise<{ month?: string | string[] }> };

export default async function AppropriationsPage({ searchParams }: Props) {
  const { role, book } = await loadDataBook();
  if (!book) return <NoBook title="Appropriations" role={role} />;
  const sp = await searchParams;
  const data = await getEditorData(book.id);
  return <AppropriationsGrid key={book.id} book={book} data={data} initialMonth={initialMonth(sp.month, book.fiscalYear)} />;
}
