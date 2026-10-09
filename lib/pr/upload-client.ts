import { createBrowserSupabase } from "@/lib/supabase/client";
import type { ActionResult } from "@/lib/actions/rpc";
import { registerAttachment } from "@/app/(app)/prs/actions";
import { safeFileName, validateFile } from "./files";

/** Browser-only: uploads to Storage, then records the file through the register_attachment RPC. */
export async function uploadAttachment(prId: string, file: File, maxMb: number, isPrDocument: boolean): Promise<ActionResult<string>> {
  const problem = validateFile(file, maxMb, isPrDocument);
  if (problem) return { ok: false, error: problem };
  const path = `${prId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await createBrowserSupabase().storage
    .from("pr-tracker-attachments").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };
  return registerAttachment(prId, path, file.name, file.size, file.type, isPrDocument);
}
