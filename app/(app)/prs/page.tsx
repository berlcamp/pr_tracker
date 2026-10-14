import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/profile";
import { parseListParams, sanitizeSearch } from "@/lib/search";
import { PrListTable } from "./pr-list-table";

export default async function PrListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireProfile();
  const p = parseListParams(await searchParams);
  const supabase = await createClient();

  let query = supabase.from("pr_overview").select("*", { count: "exact" });
  const term = sanitizeSearch(p.q);
  if (term) query = query.or(`routing_slip_no.ilike.*${term}*,pr_no.ilike.*${term}*,purpose.ilike.*${term}*`);
  if (p.state) query = query.eq("movement_state", p.state as never);
  if (p.office) query = query.eq("current_office_id", p.office);
  if (p.origin) query = query.eq("origin_office_id", p.origin);
  if (p.from) query = query.gte("pr_date", p.from);
  if (p.to) query = query.lte("pr_date", p.to);
  if (p.min) query = query.gte("amount", Number(p.min));
  if (p.max) query = query.lte("amount", Number(p.max));
  const from = (p.page - 1) * p.size;

  const [{ data, count, error }, { data: offices }] = await Promise.all([
    query.order(p.sort, { ascending: p.dir === "asc" }).range(from, from + p.size - 1),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Purchase Requests</h1>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <PrListTable rows={data ?? []} rowCount={count ?? 0} pageIndex={p.page - 1} pageSize={p.size} offices={offices ?? []} />
    </div>
  );
}
