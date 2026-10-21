import "server-only";
import Link from "next/link";
import { atLeast, requireSaao } from "@/lib/saao/access";
import { getSelectedBookId } from "@/lib/saao/book-cookie";
import { listBooks } from "@/lib/saao/queries";
import type { AllotmentMode, MovementRule, SaaoRole } from "@/lib/saao/types";

/** What the Budget Data screens need to know about the selected book. */
export type DataBook = { id: string; fiscalYear: number; label: string; allotmentMode: AllotmentMode; movementRule: MovementRule };

/**
 * Gate and book for a Budget Data screen. These are data-entry screens (encoder+): viewers see
 * figures only through finalized reports. The RPCs enforce the role again on every write.
 */
export async function loadDataBook(): Promise<{ role: SaaoRole; book: DataBook | null }> {
  const { role } = await requireSaao("encoder");
  const books = await listBooks();
  const id = await getSelectedBookId(books);
  const b = books.find((x) => x.id === id);
  if (!b) return { role, book: null };
  return {
    role,
    book: {
      id: b.id, fiscalYear: b.fiscal_year, label: `FY ${b.fiscal_year} ${b.fund?.name ?? ""}`.trim(),
      allotmentMode: b.allotment_mode as AllotmentMode, movementRule: b.movement_rule as MovementRule,
    },
  };
}

export function NoBook({ title, role }: { title: string; role: SaaoRole }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        No budget book yet. {atLeast(role, "budget_admin")
          ? <Link className="underline" href="/budget/settings">Create the first book in Budget Settings.</Link>
          : "Ask a budget admin to create one."}
      </p>
    </div>
  );
}

/** First value of a search param. */
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
