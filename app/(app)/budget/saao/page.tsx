import Link from "next/link";
import { atLeast, requireSaao } from "@/lib/saao/access";
import { getSelectedBookId } from "@/lib/saao/book-cookie";
import { initialMonth } from "@/lib/saao/cutoff";
import { getEditorData, listBooks, listReports } from "@/lib/saao/queries";
import type { AllotmentMode, MovementRule } from "@/lib/saao/types";
import { createClient } from "@/lib/supabase/server";
import { Workspace } from "./workspace";

type Props = { searchParams: Promise<{ month?: string | string[] }> };

export default async function SaaoWorkspacePage({ searchParams }: Props) {
  // viewers see finalized reports in History only; this workspace edits the live book (encoder+)
  const { role } = await requireSaao("encoder");
  const sp = await searchParams;
  const books = await listBooks();
  const bookId = await getSelectedBookId(books);
  const book = books.find((b) => b.id === bookId) ?? null;
  if (!book) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">SAAO Reports</h1>
        <p className="text-sm text-muted-foreground">
          No budget book yet. {atLeast(role, "budget_admin")
            ? <Link className="underline" href="/budget/settings">Create the first book in Budget Settings.</Link>
            : "Ask a budget admin to create one."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [data, reports, officesRes] = await Promise.all([
    getEditorData(book.id),
    listReports(book.id),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
  ]);
  if (officesRes.error) throw new Error(officesRes.error.message);

  return (
    <Workspace
      key={book.id}
      book={{
        id: book.id, fiscalYear: book.fiscal_year, title: book.title, fundName: book.fund?.name ?? "",
        allotmentMode: book.allotment_mode as AllotmentMode, movementRule: book.movement_rule as MovementRule,
        extraLabels: book.extra_labels,
      }}
      data={data}
      reports={reports.map((r) => ({ id: r.id, cutoffDate: r.cutoff_date, version: r.version, status: r.status as "draft" | "finalized" | "superseded" }))}
      offices={officesRes.data ?? []}
      initialMonth={initialMonth(sp.month, book.fiscal_year)}
      canFinalize={atLeast(role, "finalizer")}
    />
  );
}
