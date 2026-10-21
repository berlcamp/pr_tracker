import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { StuckTable, type StuckRow } from "../dashboard-tables";
import { DateRange } from "./date-range";
import { OfficeDaysTable, type OfficeDaysRow } from "./report-tables";

const manilaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
const daysAgo = (n: number) => manilaDate(new Date(Date.now() - n * 86_400_000));
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const to = isDate(sp.to) ? sp.to! : manilaDate(new Date());
  const from = isDate(sp.from) ? sp.from! : daysAgo(30);
  const supabase = await createClient();
  const [days, stuck] = await Promise.all([
    supabase.rpc("report_office_days", { p_from: from, p_to: to }),
    supabase.rpc("report_stuck_prs"),
  ]);

  const isAdmin = profile.role !== "staff";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Showing all offices." : `Showing ${profile.office?.name ?? "your office"} only.`}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Average days per office</CardTitle>
          <CardDescription>Time each office held a PR (received → forwarded/returned/completed), computed from the audit trail. Transit time is shown separately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DateRange from={from} to={to} />
          <OfficeDaysTable rows={(days.data ?? []) as OfficeDaysRow[]} canExport={isAdmin} from={from} to={to} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Stuck PRs</CardTitle><CardDescription>Held or in transit longer than the threshold in Settings.{!isAdmin && " Includes PRs at your office and PRs your office originated."}</CardDescription></CardHeader>
        <CardContent><StuckTable rows={(stuck.data ?? []) as StuckRow[]} /></CardContent>
      </Card>
    </div>
  );
}
