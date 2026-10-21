"use client";
import { useState } from "react";
import { Download, ExternalLink, FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { TextActionDialog } from "./remarks-panel";
import { PrSection } from "./pr-section";
import { cn } from "@/lib/utils";
import { validateFile } from "@/lib/pr/files";
import { uploadAttachment } from "@/lib/pr/upload-client";
import { formatDateTime } from "@/lib/format";
import { getAttachmentUrl } from "@/app/(app)/prs/actions";
import { downloadSignedUrl, openSignedUrl } from "@/lib/pr/open-signed-url";
import { supersedeAttachment } from "@/app/(app)/prs/[id]/actions";

export type AttachmentItem = {
  id: string; filename: string; size_bytes: number; mime_type: string; created_at: string;
  superseded_at: string | null; superseded_reason: string | null; office_id: string; is_pr_document: boolean;
  uploader: { full_name: string } | null; office: { name: string } | null;
};

/** Types a browser can display in a tab; Word and Excel files can only be downloaded. */
const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function AttachmentsPanel({ prId, attachments, canUpload, myOfficeId, maxMb }: {
  prId: string; attachments: AttachmentItem[]; canUpload: boolean; myOfficeId: string | null; maxMb: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const problem = file ? validateFile(file, maxMb) : null;

  async function upload() {
    if (!file) return { ok: false as const, error: "Choose a file" };
    return uploadAttachment(prId, file, maxMb, false);
  }

  function view(id: string) {
    return openSignedUrl(() => getAttachmentUrl(id));
  }
  function download(id: string) {
    return downloadSignedUrl(() => getAttachmentUrl(id, true));
  }

  const uploadDialog = canUpload && (
    <ConfirmActionDialog<string>
      trigger={<Button size="sm" variant="outline"><Paperclip className="mr-2 size-4" />Upload attachment</Button>}
      title="Upload attachment?"
      description={file ? <p>Attach <b>{file.name}</b> ({(file.size / 1024 / 1024).toFixed(2)} MB) to this PR. Followers will be notified.</p>
                        : `PDF, JPG, PNG, DOCX or XLSX up to ${maxMb} MB.`}
      confirmLabel="Upload" successMessage="File attached"
      canConfirm={!!file && !problem}
      onOpenChange={(o) => o && setFile(null)}
      onConfirm={upload}
    >
      <Label htmlFor="attachment-file">File</Label>
      <Input id="attachment-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
             onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {problem && <p className="text-sm text-destructive">{problem}</p>}
    </ConfirmActionDialog>
  );

  return (
    <PrSection title="Attachments" icon={Paperclip} count={attachments.length} action={uploadDialog}>
      {attachments.length === 0 ? <p className="py-2 text-center text-sm text-muted-foreground">No attachments.</p> : (
        <ul className="-my-2 divide-y">
          {attachments.map((a) => {
            const superseded = !!a.superseded_at;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 py-3">
                <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
                  <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg",
                    superseded ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className={cn("break-all", superseded && "text-muted-foreground line-through")}>{a.filename}</span>
                      {a.is_pr_document && <Badge>PR document</Badge>}
                      {superseded && <Badge variant="outline" title={a.superseded_reason ?? ""}>Superseded</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[a.office?.name, a.uploader?.full_name, formatDateTime(a.created_at), `${(a.size_bytes / 1024 / 1024).toFixed(2)} MB`]
                        .filter(Boolean).join(" · ")}
                    </p>
                    {superseded && a.superseded_reason && <p className="mt-0.5 text-xs text-muted-foreground">Reason: {a.superseded_reason}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {INLINE_TYPES.has(a.mime_type) && (
                    <Button variant="ghost" size="sm" onClick={() => view(a.id)}><ExternalLink className="mr-1 size-4" />View</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => download(a.id)}><Download className="mr-1 size-4" />Download</Button>
                  {!superseded && !a.is_pr_document && a.office_id === myOfficeId && (
                    <TextActionDialog
                      trigger={<Button variant="ghost" size="sm">Mark superseded</Button>}
                      title={`Mark "${a.filename}" as superseded?`}
                      description="Files are never deleted. Superseded files stay visible but struck through."
                      label="Reason" required confirmLabel="Mark superseded" successMessage="Marked superseded"
                      onConfirm={(t) => supersedeAttachment(a.id, prId, t)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PrSection>
  );
}
