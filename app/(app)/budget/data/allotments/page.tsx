import { getEditorData } from "@/lib/saao/queries";
import { loadDataBook, NoBook } from "../data-book";
import { AllotmentsTable } from "./allotments-table";

export default async function AllotmentsPage() {
  const { role, book } = await loadDataBook();
  if (!book) return <NoBook title="Allotments" role={role} />;
  const data = await getEditorData(book.id);
  return <AllotmentsTable key={book.id} book={book} data={data} />;
}
