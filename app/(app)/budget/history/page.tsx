import Link from "next/link";
import { requireSaao } from "@/lib/saao/access";
import { getSelectedBookId } from "@/lib/saao/book-cookie";
import { listBooks, listReports } from "@/lib/saao/queries";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function HistoryPage() {
  await requireSaao("viewer");
  const books = await listBooks();
  const bookId = await getSelectedBookId(books);
  const book = books.find((b) => b.id === bookId) ?? null;
  if (!book) return <p className="text-sm text-muted-foreground">No budget book yet.</p>;

  const reports = await listReports(book.id);
  const ids = [...new Set(reports.flatMap((r) => [r.created_by, r.finalized_by]).filter((x): x is string => !!x))];
  const supabase = await createClient();
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const who = (id: string | null) => (id ? (name.get(id) ?? "—") : "—");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Report History</h1>
      <Table>
        <TableHeader>
          <TableRow>
            {["FY", "Fund", "Cutoff", "Version", "Status", "Created by / at", "Finalized by / at", "Revision reason"].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No reports for this book yet.</TableCell></TableRow>
          )}
          {reports.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{book.fiscal_year}</TableCell>
              <TableCell>{book.fund?.name ?? "—"}</TableCell>
              <TableCell><Link className="underline" href={`/budget/history/${r.id}`}>{r.cutoff_date}</Link></TableCell>
              <TableCell>v{r.version}</TableCell>
              <TableCell>
                <Badge variant={r.status === "superseded" ? "secondary" : "outline"}
                  className={r.status === "draft" ? "bg-amber-100 text-amber-900" : r.status === "finalized" ? "bg-green-100 text-green-900" : undefined}>
                  {r.status[0].toUpperCase() + r.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell>{who(r.created_by)}<div className="text-xs text-muted-foreground">{fmt(r.created_at)}</div></TableCell>
              <TableCell>{r.finalized_at ? <>{who(r.finalized_by)}<div className="text-xs text-muted-foreground">{fmt(r.finalized_at)}</div></> : "—"}</TableCell>
              <TableCell>{r.revision_reason ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
