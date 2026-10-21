import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile";
import { getSaaoRole } from "@/lib/saao/access";
import { getSelectedBookId } from "@/lib/saao/book-cookie";
import { listBooks } from "@/lib/saao/queries";
import { BookSwitcher } from "./book-switcher";

export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const role = await getSaaoRole();
  // PR admins without a budget role may open Budget Settings (the Access tab) only; that page enforces it.
  if (!role && profile.role === "staff") redirect("/");
  const books = role ? await listBooks() : [];
  const selected = await getSelectedBookId(books);
  return (
    <div className="space-y-6">
      {books.length > 0 && (
        <BookSwitcher selectedId={selected}
          books={books.map((b) => ({ id: b.id, label: `FY ${b.fiscal_year} ${b.fund?.name ?? ""}`.trim() }))} />
      )}
      {children}
    </div>
  );
}
