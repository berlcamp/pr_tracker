import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { availableActions } from "@/lib/pr/permissions";
import type { MovementState } from "@/lib/types";
import { PrHeader } from "@/components/pr/pr-header";
import { PrDocumentCard, type PrDocument } from "@/components/pr/pr-document-card";
import { PrTimeline } from "@/components/pr/pr-timeline";
import { RemarksPanel } from "@/components/pr/remarks-panel";
import { AttachmentsPanel } from "@/components/pr/attachments-panel";
import { PrivateNotesPanel } from "@/components/pr/private-notes-panel";
import { PrActionBar, type Suggestion } from "@/components/pr/pr-action-bar";
import { PrSection } from "@/components/pr/pr-section";
import { formatDate, formatPeso } from "@/lib/format";

export default async function PrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: pr } = await supabase.from("pr_overview").select("*").eq("id", id).maybeSingle();
  if (!pr) notFound();

  const officeId = profile.office?.id;
  const empty = Promise.resolve({ data: [] as never[] });
  const [prDoc, maxMbRes, timeline, remarks, notes, attachments] = await Promise.all([
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
    supabase.from("pr_attachments")
      .select("id, filename, size_bytes, mime_type, created_at, superseded_at, superseded_reason, office_id, is_pr_document, uploader:profiles(full_name), office:offices(name)")
      .eq("pr_id", id).order("created_at"),
  ]);

  const actions = availableActions({
    movement_state: pr.movement_state as MovementState, origin_office_id: pr.origin_office_id!,
    current_office_id: pr.current_office_id!, sent_by_office_id: pr.sent_by_office_id,
    has_pr_document: !!pr.has_pr_document,
  }, profile);
  const maxMb = Number(maxMbRes.data?.value ?? 20);

  const actionList = [...actions];
  const [suggestionRes, officesRes, involvedRes, statusesRes, followRes] = await Promise.all([
    actions.has("forward") ? supabase.rpc("suggest_next_step", { p_pr_id: id }) : Promise.resolve({ data: null }),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
    supabase.from("pr_involved_offices").select("office_id, office:offices(name)").eq("pr_id", id),
    officeId ? supabase.from("office_statuses").select("id, label, allows_completion").eq("office_id", officeId).eq("active", true).order("sort_order") : empty,
    officeId ? supabase.from("pr_followers").select("office_id").eq("pr_id", id).eq("office_id", officeId) : empty,
  ]);
  const suggestion = ((suggestionRes.data as { next?: unknown } | null)?.next ?? null) as Suggestion;
  const returnTargets = (involvedRes.data ?? [])
    .filter((i) => i.office_id !== officeId)
    .map((i) => ({ id: i.office_id, name: (i.office as { name: string } | null)?.name ?? "" }));
  const terminal = pr.movement_state === "completed" || pr.movement_state === "cancelled";

  const detail = (label: string, value: React.ReactNode, wide = false) => (
    <div className={wide ? "col-span-2" : "min-w-0"}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value ?? "—"}</dd>
    </div>
  );

  // Two columns on desktop: the PR on the left, a sticky timeline on the right. On mobile the timeline follows the details.
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:grid-rows-[repeat(6,auto)_1fr]">
      <div className="space-y-4 lg:col-start-1">
        <PrHeader pr={pr} actions={
          <PrActionBar
            pr={{ id, routing_slip_no: pr.routing_slip_no!, pr_no: pr.pr_no, mode_of_procurement: pr.mode_of_procurement,
                  current_office_name: pr.current_office_name!, sent_by_office_name: pr.sent_by_office_name, total_steps: pr.total_steps ?? 0,
                  has_pr_document: !!pr.has_pr_document, current_status_id: pr.current_status_id,
                  current_status_label: pr.current_status_label }}
            actions={actionList} suggestion={suggestion}
            offices={officesRes.data ?? []} returnTargets={returnTargets} statuses={statusesRes.data ?? []}
            myOfficeId={officeId ?? null} myOfficeName={profile.office?.name ?? null}
            isFollowing={(followRes.data ?? []).length > 0}
            canFollow={!!officeId && !terminal}
          />
        } />
        <PrDocumentCard prId={id} doc={(prDoc.data ?? null) as PrDocument | null} canUpload={actions.has("upload_pr_document")} maxMb={maxMb} />
      </div>
      <PrSection title="Details" icon={ClipboardList} className="lg:col-start-1">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          {detail("Purpose", <span className="font-normal whitespace-pre-wrap">{pr.purpose}</span>, true)}
          {detail("Requested by", <>{pr.requested_by_name}{pr.requested_by_designation && <span className="font-normal text-muted-foreground">, {pr.requested_by_designation}</span>}</>)}
          {detail("Origin office", pr.origin_office_name)}
          {detail("PR date", formatDate(pr.pr_date!))}
          {detail("Amount", <span className="tabular-nums">{formatPeso(Number(pr.amount))}</span>)}
          {detail("Mode of procurement", pr.mode_of_procurement)}
          {detail("Responsibility Center Code", pr.responsibility_center_code)}
          {detail("Fund Cluster", pr.fund_cluster)}
        </dl>
      </PrSection>
      <Card className="gap-0 overflow-hidden py-0 max-lg:max-h-[70svh] lg:sticky lg:top-20 lg:col-start-2 lg:row-[1/-1] lg:max-h-[calc(100svh-6.5rem)]">
        <PrTimeline events={timeline.data ?? []} totalSteps={pr.total_steps ?? 0} />
      </Card>
      <div className="lg:col-start-1">
        <RemarksPanel prId={id} remarks={(remarks.data ?? []) as never} canAdd={actions.has("add_remark")} />
      </div>
      <div className="lg:col-start-1">
        <AttachmentsPanel prId={id} attachments={(attachments.data ?? []) as never}
          canUpload={actions.has("add_attachment")} myOfficeId={officeId ?? null} maxMb={maxMb} />
      </div>
      {officeId && (
        <div className="lg:col-start-1">
          <PrivateNotesPanel prId={id} notes={(notes.data ?? []) as never} canAdd={actions.has("add_private_note")} />
        </div>
      )}
    </div>
  );
}
