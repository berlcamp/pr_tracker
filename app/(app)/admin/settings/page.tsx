import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["lgu_name", "stuck_threshold_days", "max_upload_mb"]);
  const get = (k: string) => String(data?.find((r) => r.key === k)?.value ?? "");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm values={{ lgu_name: get("lgu_name"), stuck_threshold_days: get("stuck_threshold_days"), max_upload_mb: get("max_upload_mb") }} />
    </div>
  );
}
