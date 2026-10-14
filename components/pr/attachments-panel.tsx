"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { TextActionDialog } from "./remarks-panel";
import { validateFile } from "@/lib/pr/files";
import { uploadAttachment } from "@/lib/pr/upload-client";
import { formatDateTime } from "@/lib/format";
import { getAttachmentUrl } from "@/app/(app)/prs/actions";
import { openSignedUrl } from "@/lib/pr/open-signed-url";
import { supersedeAttachment } from "@/app/(app)/prs/[id]/actions";

export type AttachmentItem = {
  id: string; filename: string; size_bytes: number; mime_type: string; created_at: string;
  superseded_at: string | null; superseded_reason: string | null; office_id: string; is_pr_document: boolean;
  uploader: { full_name: string } | null; office: { name: string } | null;
};

export function AttachmentsPanel({ prId, attachments, canUpload, myOfficeId, maxMb }: {
  prId: string; attachments: AttachmentItem[]; canUpload: boolean; myOfficeId: string | null; maxMb: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const problem = file ? validateFile(file, maxMb) : null;

  async function upload() {
    if (!file) return { ok: false as const, error: "Choose a file" };
    return uploadAttachment(prId, file, maxMb, false);
  }

  function download(id: string) {
    return openSignedUrl(() => getAttachmentUrl(id));
  }

  const columns: ColumnDef<AttachmentItem>[] = [
    { accessorKey: "filename", header: "File", cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className={row.original.superseded_at ? "text-muted-foreground line-through" : ""}>{row.original.filename}</span>
        {row.original.is_pr_document && <Badge>PR document</Badge>}
      </span>) },
    { id: "office", header: "Office", accessorFn: (r) => r.office?.name ?? "" },
    { id: "uploader", header: "Uploaded by", accessorFn: (r) => r.uploader?.full_name ?? "" },
    { accessorKey: "size_bytes", header: "Size", cell: ({ row }) => `${(row.original.size_bytes / 1024 / 1024).toFixed(2)} MB` },
    { accessorKey: "created_at", header: "Uploaded", cell: ({ row }) => formatDateTime(row.original.created_at) },
    { id: "status", header: "Status", cell: ({ row }) => row.original.superseded_at
      ? <Badge variant="outline" title={row.original.superseded_reason ?? ""}>Superseded</Badge> : <Badge variant="secondary">Current</Badge> },
    { id: "actions", header: "", enableHiding: false, cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => download(row.original.id)}><Download className="mr-1 size-4" />Download</Button>
        {!row.original.superseded_at && !row.original.is_pr_document && row.original.office_id === myOfficeId && (
          <TextActionDialog
            trigger={<Button variant="ghost" size="sm">Mark superseded</Button>}
            title={`Mark "${row.original.filename}" as superseded?`}
            description="Files are never deleted. Superseded files stay visible but struck through."
            label="Reason" required confirmLabel="Mark superseded" successMessage="Marked superseded"
            onConfirm={(t) => supersedeAttachment(row.original.id, prId, t)}
          />
        )}
      </div>) },
  ];

  return (
    <div className="space-y-4">
      {canUpload && (
        <ConfirmActionDialog<string>
          trigger={<Button size="sm"><Paperclip className="mr-2 size-4" />Upload attachment</Button>}
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
      )}
      <DataTable columns={columns} data={attachments} searchPlaceholder="Filter files…" emptyMessage="No attachments." />
    </div>
  );
}
