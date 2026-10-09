import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { availableActions } from "@/lib/pr/permissions";
import type { MovementState } from "@/lib/types";
import { PrHeader } from "@/components/pr/pr-header";
import { PrDocumentCard, type PrDocument } from "@/components/pr/pr-document-card";
import { PrTimeline } from "@/components/pr/pr-timeline";
import { RemarksPanel } from "@/components/pr/remarks-panel";
import { PrivateNotesPanel } from "@/components/pr/private-notes-panel";
import { formatPeso } from "@/lib/format";

export default async function PrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: pr } = await supabase.from("pr_overview").select("*").eq("id", id).maybeSingle();
  if (!pr) notFound();

  const officeId = profile.office?.id;
  const empty = Promise.resolve({ data: [] as never[] });
  const [prDoc, maxMbRes, timeline, remarks, notes] = await Promise.all([
    supabase.from("pr_attachments").select("id, filename, created_at, uploader:profiles(full_name)")
      .eq("pr_id", id).eq("is_pr_document", true).is("superseded_at", null).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "max_upload_mb").maybeSingle(),
    supabase.from("pr_timeline").select("*").eq("pr_id", id).order("id", { ascending: false }),
    supabase.from("pr_remarks").select("id, body, created_at, author:profiles(full_name), office:offices(name)")
      .eq("pr_id", id).order("created_at", { ascending: false }),
    officeId
      ? supabase.from("pr_private_notes").select("id, body, created_at, author:profiles(full_name)")
          .eq("pr_id", id).order("created_at", { ascending: false })
      : empty,
  ]);

  const actions = availableActions({
    movement_state: pr.movement_state as MovementState, origin_office_id: pr.origin_office_id!,
    current_office_id: pr.current_office_id!, sent_by_office_id: pr.sent_by_office_id,
    has_pr_document: !!pr.has_pr_document,
  }, profile);
  const maxMb = Number(maxMbRes.data?.value ?? 20);

  return (
    <div className="space-y-6">
      <PrHeader pr={pr} />
      <PrDocumentCard prId={id} doc={(prDoc.data ?? null) as PrDocument | null} canUpload={actions.has("upload_pr_document")} maxMb={maxMb} />
      <Tabs defaultValue="details">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="remarks">Remarks ({remarks.data?.length ?? 0})</TabsTrigger>
          {officeId && <TabsTrigger value="notes">Private notes</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="space-y-4">
          <Card><CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Purpose: </span>{pr.purpose}</div>
            <div><span className="text-muted-foreground">Responsibility Center Code: </span>{pr.responsibility_center_code ?? "—"}</div>
            <div><span className="text-muted-foreground">Fund Cluster: </span>{pr.fund_cluster ?? "—"}</div>
            <div><span className="text-muted-foreground">Requested by: </span>{pr.requested_by_name}{pr.requested_by_designation ? `, ${pr.requested_by_designation}` : ""}</div>
            <div><span className="text-muted-foreground">Amount: </span>{formatPeso(Number(pr.amount))}</div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="timeline"><PrTimeline events={timeline.data ?? []} totalSteps={pr.total_steps ?? 0} /></TabsContent>
        <TabsContent value="remarks">
          <RemarksPanel prId={id} remarks={(remarks.data ?? []) as never} canAdd={actions.has("add_remark")} />
        </TabsContent>
        {officeId && (
          <TabsContent value="notes">
            <PrivateNotesPanel prId={id} notes={(notes.data ?? []) as never} canAdd={actions.has("add_private_note")} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
