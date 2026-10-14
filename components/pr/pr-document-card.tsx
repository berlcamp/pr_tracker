"use client";
import { useState } from "react";
import { AlertTriangle, ExternalLink, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { formatDateTime } from "@/lib/format";
import { validateFile } from "@/lib/pr/files";
import { uploadAttachment } from "@/lib/pr/upload-client";
import { getAttachmentUrl } from "@/app/(app)/prs/actions";
import { openSignedUrl } from "@/lib/pr/open-signed-url";

export type PrDocument = { id: string; filename: string; created_at: string; uploader: { full_name: string } | null };

export function PrDocumentCard({ prId, doc, canUpload, maxMb }: { prId: string; doc: PrDocument | null; canUpload: boolean; maxMb: number }) {
  const [file, setFile] = useState<File | null>(null);
  const problem = file ? validateFile(file, maxMb, true) : null;

  function view() {
    return openSignedUrl(() => getAttachmentUrl(doc!.id));
  }

  const uploadDialog = canUpload && (
    <ConfirmActionDialog<string>
      trigger={<Button size="sm" variant={doc ? "outline" : "default"}><Upload className="mr-2 size-4" />{doc ? "Replace" : "Upload PR document"}</Button>}
      title={doc ? "Replace the PR document?" : "Upload the PR document?"}
      description={file
        ? <p><b>{file.name}</b> will become the official PR document.{doc && <> The current file <b>{doc.filename}</b> is kept as superseded.</>}</p>
        : `PDF, JPG or PNG, up to ${maxMb} MB.`}
      confirmLabel={doc ? "Replace" : "Upload"} successMessage="PR document saved"
      canConfirm={!!file && !problem}
      onOpenChange={(o) => o && setFile(null)}
      onConfirm={() => uploadAttachment(prId, file!, maxMb, true)}
    >
      <Label htmlFor="pr-doc-file">File</Label>
      <Input id="pr-doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {problem && <p className="text-sm text-destructive">{problem}</p>}
    </ConfirmActionDialog>
  );

  if (!doc) {
    return (
      <Card className="border-amber-300 bg-amber-50"><CardContent className="flex flex-wrap items-center gap-3 p-4">
        <AlertTriangle className="size-5 text-amber-600" />
        <p className="flex-1 text-sm">No PR document uploaded yet. This PR cannot be forwarded until the signed PR is uploaded.</p>
        {uploadDialog}
      </CardContent></Card>
    );
  }
  return (
    <Card><CardContent className="flex flex-wrap items-center gap-3 p-4">
      <FileText className="size-5 text-primary" />
      <div className="flex-1 text-sm">
        <div className="font-medium">PR document: {doc.filename}</div>
        <div className="text-xs text-muted-foreground">Uploaded by {doc.uploader?.full_name} · {formatDateTime(doc.created_at)}</div>
      </div>
      <Button size="sm" variant="outline" onClick={view}><ExternalLink className="mr-2 size-4" />View</Button>
      {uploadDialog}
    </CardContent></Card>
  );
}
