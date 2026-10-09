import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { PrForm } from "@/components/pr/pr-form";

export default async function NewPrPage() {
  const profile = await requireProfile();
  if (!profile.office) return <p className="text-muted-foreground">Your account is not assigned to an office, so it cannot create PRs.</p>;
  const supabase = await createClient();
  const { data: maxMb } = await supabase.from("app_settings").select("value").eq("key", "max_upload_mb").maybeSingle();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New Purchase Request</h1>
      <p className="text-sm text-muted-foreground">Office/Section: {profile.office.name}</p>
      <PrForm mode="create" maxMb={Number(maxMb?.value ?? 20)} defaultValues={{
        pr_date: today, purpose: "", amount: undefined as unknown as number,
        responsibility_center_code: "", fund_cluster: "",
        requested_by_name: profile.full_name, requested_by_designation: profile.designation ?? "",
      }} />
    </div>
  );
}
