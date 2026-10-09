"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { ActionResult } from "@/lib/actions/rpc";
import { formatPeso } from "@/lib/format";
import { validateFile } from "@/lib/pr/files";
import { prFormSchema, type PrFormValues } from "@/lib/pr/schema";
import { uploadAttachment } from "@/lib/pr/upload-client";
import { createPr, updatePr } from "@/app/(app)/prs/actions";

const TEXT_FIELDS: { name: keyof PrFormValues; label: string; type?: string }[] = [
  { name: "pr_date", label: "Date", type: "date" },
  { name: "requested_by_name", label: "Requested by (name)" },
  { name: "requested_by_designation", label: "Requested by (designation)" },
  { name: "responsibility_center_code", label: "Responsibility Center Code (optional)" },
  { name: "fund_cluster", label: "Fund Cluster (optional)" },
];

export function PrForm({ mode, prId, defaultValues, maxMb, currentDocumentName }: {
  mode: "create" | "edit"; prId?: string; defaultValues: PrFormValues; maxMb: number; currentDocumentName?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PrFormValues | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<PrFormValues>({
    resolver: zodResolver(prFormSchema),
    defaultValues,
  });

  function onValid(values: PrFormValues) {
    if (mode === "create" && !file) return setFileError("Attach the signed PR document.");
    if (file) {
      const problem = validateFile(file, maxMb, true);
      if (problem) return setFileError(problem);
    }
    setFileError(null);
    setPending(values);
  }

  async function submit(): Promise<ActionResult<string>> {
    const values = pending!;
    if (mode === "create") {
      const created = await createPr(values);
      if (!created.ok) return created;
      const up = await uploadAttachment(created.data, file!, maxMb, true);
      if (!up.ok) toast.error(`PR created, but the PR document upload failed: ${up.error} Upload it from the PR page.`);
      return { ok: true, data: created.data };
    }
    const updated = await updatePr(prId!, values);
    if (!updated.ok) return updated;
    if (file) {
      const up = await uploadAttachment(prId!, file, maxMb, true);
      if (!up.ok) return up;
    }
    return { ok: true, data: prId! };
  }

  return (
    <>
      <form onSubmit={handleSubmit(onValid)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Purchase Request</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea id="purpose" rows={2} {...register("purpose")} />
              {errors.purpose && <p className="text-xs text-destructive">{errors.purpose.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (₱)</Label>
              <Input id="amount" type="number" step="0.01" min="0" {...register("amount", { valueAsNumber: true })} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            {TEXT_FIELDS.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input id={f.name} type={f.type ?? "text"} {...register(f.name)} />
                {errors[f.name] && <p className="text-xs text-destructive">{String(errors[f.name]?.message)}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Signed PR document</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {mode === "edit" && currentDocumentName && (
              <p className="text-sm text-muted-foreground">Current file: <span className="font-medium text-foreground">{currentDocumentName}</span>. Choose a file only if you want to replace it.</p>
            )}
            <Label htmlFor="pr-document">PDF, JPG or PNG, up to {maxMb} MB</Label>
            <Input id="pr-document" type="file" accept=".pdf,.jpg,.jpeg,.png"
                   onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFileError(null); }} />
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Back</Button>
          <Button type="submit">{mode === "create" ? "Create PR" : "Save changes"}</Button>
        </div>
      </form>

      <ConfirmActionDialog<string>
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={mode === "create" ? "Create this purchase request?" : "Save changes to this purchase request?"}
        description={
          <p>
            Amount <b>{formatPeso(pending?.amount ?? 0)}</b>.{" "}
            {file && <>The file <b>{file.name}</b> will be {mode === "create" ? "uploaded as" : "uploaded to replace"} the PR document.{" "}</>}
            {mode === "create" ? "It will be saved as a Draft at your office. You can forward it afterwards." : "The change is recorded in the audit trail."}
          </p>
        }
        confirmLabel={mode === "create" ? "Create PR" : "Save changes"}
        successMessage={mode === "create" ? "Purchase request created" : "Changes saved"}
        onConfirm={submit}
        onSuccess={(id) => router.push(`/prs/${id}`)}
      />
    </>
  );
}
