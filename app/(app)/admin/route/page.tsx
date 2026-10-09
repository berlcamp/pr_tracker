import { createClient } from "@/lib/supabase/server";
import { RouteEditor } from "./route-editor";

export default async function RoutePage() {
  const supabase = await createClient();
  const [{ data: steps }, { data: offices }] = await Promise.all([
    supabase.from("default_route_steps").select("id, office_id, purpose").order("step_order"),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Default Route</h1>
      <RouteEditor initial={steps ?? []} offices={offices ?? []} />
    </div>
  );
}
