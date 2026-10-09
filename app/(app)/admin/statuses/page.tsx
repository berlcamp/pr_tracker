import { createClient } from "@/lib/supabase/server";
import { StatusesTable } from "./statuses-table";

export default async function StatusesPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const supabase = await createClient();
  const { data: offices } = await supabase.from("offices").select("id, name").eq("active", true).order("name");
  const { office } = await searchParams;
  const officeId = offices?.find((o) => o.id === office)?.id ?? offices?.[0]?.id;
  const { data: statuses } = officeId
    ? await supabase.from("office_statuses").select("*").eq("office_id", officeId).order("sort_order")
    : { data: [] };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Office Statuses</h1>
      {officeId ? <StatusesTable key={officeId} offices={offices ?? []} officeId={officeId} statuses={statuses ?? []} />
                : <p className="text-sm text-muted-foreground">Create an office first.</p>}
    </div>
  );
}
