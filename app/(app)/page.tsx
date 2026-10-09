import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { FollowingTable, IncomingTable, MyPrsTable, OnHandTable, StuckTable, type StuckRow } from "./dashboard-tables";

function manilaMonthStart(): string {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  return `${ym}-01T00:00:00+08:00`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card><CardContent className="p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!profile.office) {
    const { data } = await supabase.rpc("report_stuck_prs");
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your account is not assigned to an office. Showing PRs that are stuck across all offices.</p>
        <Card><CardHeader><CardTitle>Stuck PRs</CardTitle></CardHeader><CardContent><StuckTable rows={(data ?? []) as StuckRow[]} /></CardContent></Card>
      </div>
    );
  }

  const officeId = profile.office.id;
  const [incoming, onHand, mine, drafts, completed, following, threshold] = await Promise.all([
    supabase.from("pr_overview").select("*").eq("current_office_id", officeId).in("movement_state", ["in_transit", "returned"]).order("current_since"),
    supabase.from("pr_overview").select("*").eq("current_office_id", officeId).eq("movement_state", "received").order("current_since"),
    supabase.from("pr_overview").select("*").eq("origin_office_id", officeId).not("movement_state", "in", "(completed,cancelled)")
      .order("updated_at", { ascending: false }).limit(100),
    supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("origin_office_id", officeId).eq("movement_state", "draft"),
    supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("movement_state", "completed").gte("current_since", manilaMonthStart()),
    supabase.from("followed_activity").select("*").order("id", { ascending: false }).limit(15),
    supabase.from("app_settings").select("value").eq("key", "stuck_threshold_days").maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{profile.office.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Incoming" value={incoming.data?.length ?? 0} />
        <Stat label="On hand" value={onHand.data?.length ?? 0} />
        <Stat label="Drafts" value={drafts.count ?? 0} />
        <Stat label="Completed this month" value={completed.count ?? 0} />
      </div>
      <Card><CardHeader><CardTitle>Incoming — needs to be received</CardTitle></CardHeader>
        <CardContent><IncomingTable rows={incoming.data ?? []} officeName={profile.office.name} /></CardContent></Card>
      <Card><CardHeader><CardTitle>On hand</CardTitle></CardHeader>
        <CardContent><OnHandTable rows={onHand.data ?? []} threshold={Number(threshold.data?.value ?? 5)} /></CardContent></Card>
      <Card><CardHeader><CardTitle>My office&apos;s PRs</CardTitle></CardHeader>
        <CardContent><MyPrsTable rows={mine.data ?? []} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Following — recent activity</CardTitle></CardHeader>
        <CardContent><FollowingTable rows={following.data ?? []} /></CardContent></Card>
    </div>
  );
}
