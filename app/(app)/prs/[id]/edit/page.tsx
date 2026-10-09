import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { availableActions } from "@/lib/pr/permissions";
import { PrForm } from "@/components/pr/pr-form";
import type { MovementState } from "@/lib/types";

export default async function EditPrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: pr }, { data: doc }, { data: maxMb }] = await Promise.all([
    supabase.from("pr_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("pr_attachments").select("filename").eq("pr_id", id).eq("is_pr_document", true).is("superseded_at", null).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "max_upload_mb").maybeSingle(),
  ]);
  if (!pr) notFound();
  const actions = availableActions({
    movement_state: pr.movement_state as MovementState, origin_office_id: pr.origin_office_id!,
    current_office_id: pr.current_office_id!, sent_by_office_id: pr.sent_by_office_id, has_pr_document: !!pr.has_pr_document,
  }, profile);
  if (!actions.has("edit")) redirect(`/prs/${id}`);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit {pr.routing_slip_no}</h1>
      <PrForm mode="edit" prId={id} maxMb={Number(maxMb?.value ?? 20)} currentDocumentName={doc?.filename ?? null} defaultValues={{
        pr_date: pr.pr_date!, purpose: pr.purpose!, amount: Number(pr.amount),
        responsibility_center_code: pr.responsibility_center_code ?? "", fund_cluster: pr.fund_cluster ?? "",
        requested_by_name: pr.requested_by_name!, requested_by_designation: pr.requested_by_designation ?? "",
      }} />
    </div>
  );
}
