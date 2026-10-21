import "server-only";
import { cookies } from "next/headers";

export const BOOK_COOKIE = "saao_book";

/** Selected book id from the cookie, falling back to the latest fiscal year. `books` must be newest-first. */
export async function getSelectedBookId(books: { id: string }[]): Promise<string | null> {
  const stored = (await cookies()).get(BOOK_COOKIE)?.value;
  if (stored && books.some((b) => b.id === stored)) return stored;
  return books[0]?.id ?? null;
}
