"use server";
import { createClient } from "@/lib/supabase/server";
import { prFormSchema, toRpcPayload, type PrFormValues } from "@/lib/pr/schema";
import { rpcAction, type ActionResult } from "@/lib/actions/rpc";

export async function createPr(values: PrFormValues): Promise<ActionResult<string>> {
  const parsed = prFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };
  return rpcAction<string>("create_pr", { p_header: toRpcPayload(parsed.data).header }, ["/", "/prs"]);
}

export async function updatePr(prId: string, values: PrFormValues): Promise<ActionResult<null>> {
  const parsed = prFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };
  return rpcAction("update_pr_content", { p_pr_id: prId, p_header: toRpcPayload(parsed.data).header }, [`/prs/${prId}`, "/prs"]);
}

export async function registerAttachment(
  prId: string, path: string, filename: string, size: number, mime: string, isPrDocument: boolean,
): Promise<ActionResult<string>> {
  return rpcAction<string>("register_attachment", {
    p_pr_id: prId, p_storage_path: path, p_filename: filename, p_size_bytes: size, p_mime_type: mime,
    p_is_pr_document: isPrDocument,
  }, [`/prs/${prId}`, "/"]);
}

/** Signed link to an attachment. `download` forces a save under the original filename instead of opening it inline. */
export async function getAttachmentUrl(attachmentId: string, download = false): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data: att } = await supabase.from("pr_attachments").select("storage_path, filename").eq("id", attachmentId).maybeSingle();
  if (!att) return { ok: false, error: "Attachment not found" };
  const { data, error } = await supabase.storage.from("pr-tracker-attachments").createSignedUrl(att.storage_path, 60, download ? { download: att.filename } : undefined);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create link" };
  return { ok: true, data: data.signedUrl };
}
