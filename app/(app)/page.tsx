import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { FollowingTable, IncomingTable, OnHandTable, StuckTable, type StuckRow } from "./dashboard-tables";
import { OnHandAgeChart, OpenPrLocationsChart, WeeklyActivityChart, type AgeBucket } from "./dashboard-charts";

function manilaMonthStart(): string {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  return `${ym}-01T00:00:00+08:00`;
}

// Bucket on-hand PRs by days held; the last bucket starts at the stuck threshold.
function ageBuckets(days: number[], threshold: number): AgeBucket[] {
  const edges = [...new Set([0, 1, 3].filter((e) => e < threshold))].concat(threshold);
  return edges.map((lo, i) => {
    const hi = edges[i + 1];
    const label = hi === undefined ? `${lo}+ days` : lo === 0 && hi === 1 ? "Under 1 day" : hi - lo === 1 ? `${lo} day${lo === 1 ? "" : "s"}` : `${lo}–${hi - 1} days`;
    return { label, prs: days.filter((d) => d >= lo && (hi === undefined || d < hi)).length };
  });
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
        <p className="text-sm text-muted-foreground">
          {profile.role === "staff"
            ? "Your account is not assigned to an office. Ask an administrator to assign one."
            : "Your account is not assigned to an office. Showing PRs that are stuck across all offices."}
        </p>
        <Card><CardHeader><CardTitle>Stuck PRs</CardTitle></CardHeader><CardContent><StuckTable rows={(data ?? []) as StuckRow[]} /></CardContent></Card>
      </div>
    );
  }

  const officeId = profile.office.id;
  const [incoming, onHand, drafts, completed, following, threshold, activity, locations] = await Promise.all([
    supabase.from("pr_overview").select("*").eq("current_office_id", officeId).in("movement_state", ["in_transit", "returned"]).order("current_since"),
    supabase.from("pr_overview").select("*").eq("current_office_id", officeId).eq("movement_state", "received").order("current_since"),
    supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("origin_office_id", officeId).eq("movement_state", "draft"),
    supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("origin_office_id", officeId).eq("movement_state", "completed").gte("current_since", manilaMonthStart()),
    supabase.from("followed_activity").select("*").order("id", { ascending: false }).limit(15),
    supabase.from("app_settings").select("value").eq("key", "stuck_threshold_days").maybeSingle(),
    supabase.rpc("dashboard_weekly_activity", { p_weeks: 12 }),
    supabase.rpc("dashboard_open_pr_locations"),
  ]);
  const stuckDays = Number(threshold.data?.value ?? 5);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{profile.office.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Incoming" value={incoming.data?.length ?? 0} />
        <Stat label="On hand" value={onHand.data?.length ?? 0} />
        <Stat label="Drafts" value={drafts.count ?? 0} />
        <Stat label="Completed this month" value={completed.count ?? 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>PR activity</CardTitle>
            <CardDescription>PRs your office received vs. sent out (forwarded or returned), per week, last 12 weeks</CardDescription></CardHeader>
          <CardContent><WeeklyActivityChart rows={activity.data ?? []} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>On hand by days held</CardTitle>
            <CardDescription>{stuckDays}+ days counts as stuck</CardDescription></CardHeader>
          <CardContent><OnHandAgeChart buckets={ageBuckets((onHand.data ?? []).map((r) => Number(r.days_here)), stuckDays)} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Where your office&apos;s open PRs are</CardTitle>
            <CardDescription>Current office of PRs your office started that aren&apos;t completed or cancelled</CardDescription></CardHeader>
          <CardContent><OpenPrLocationsChart rows={locations.data ?? []} myOfficeName={profile.office.name} /></CardContent>
        </Card>
      </div>
      <Card><CardHeader><CardTitle>Incoming — needs to be received</CardTitle></CardHeader>
        <CardContent><IncomingTable rows={incoming.data ?? []} officeName={profile.office.name} /></CardContent></Card>
      <Card><CardHeader><CardTitle>On hand</CardTitle></CardHeader>
        <CardContent><OnHandTable rows={onHand.data ?? []} threshold={stuckDays} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Following — recent activity</CardTitle></CardHeader>
        <CardContent><FollowingTable rows={following.data ?? []} /></CardContent></Card>
    </div>
  );
}
