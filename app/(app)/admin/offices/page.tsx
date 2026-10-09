import { createClient } from "@/lib/supabase/server";
import { OfficesTable } from "./offices-table";

export default async function OfficesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("offices").select("*").order("name");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Offices</h1>
      <OfficesTable offices={data ?? []} />
    </div>
  );
}
