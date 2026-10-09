import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrackingView, type TrackingResult } from "@/components/pr/tracking-view";
import { TrackForm } from "../track-form";

export default async function TrackResultPage({ params }: { params: Promise<{ rs: string }> }) {
  const { rs } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("tracking_lookup", { p_routing_slip_no: decodeURIComponent(rs) });
  const result = data as unknown as TrackingResult | null;
  if (result?.can_view && result.pr_id) redirect(`/prs/${result.pr_id}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Track a PR</h1>
      <TrackForm />
      {result ? <TrackingView data={result} />
              : <p className="text-sm text-muted-foreground">No purchase request found for <span className="font-mono">{decodeURIComponent(rs)}</span>.</p>}
    </div>
  );
}
