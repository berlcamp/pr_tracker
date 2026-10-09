"use client";
import { useState, type ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { ActionResult } from "@/lib/actions/rpc";
import { formatDateTime } from "@/lib/format";
import { addRemark } from "@/app/(app)/prs/[id]/actions";

export function TextActionDialog({
  trigger, title, description, label, required = false, multiline = true, confirmLabel, destructive,
  initialValue = "", successMessage, onConfirm,
}: {
  trigger: ReactNode; title: string; description: ReactNode; label: string; required?: boolean; multiline?: boolean;
  confirmLabel: string; destructive?: boolean; initialValue?: string; successMessage: string;
  onConfirm: (text: string) => Promise<ActionResult<unknown>>;
}) {
  const [text, setText] = useState(initialValue);
  return (
    <ConfirmActionDialog
      trigger={trigger} title={title} description={description} confirmLabel={confirmLabel}
      destructive={destructive} successMessage={successMessage}
      canConfirm={!required || text.trim().length > 0}
      onOpenChange={(o) => o && setText(initialValue)}
      onConfirm={() => onConfirm(text.trim())}
    >
      <Label htmlFor="action-text">{label}{required ? "" : " (optional)"}</Label>
      {multiline
        ? <Textarea id="action-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        : <Input id="action-text" value={text} onChange={(e) => setText(e.target.value)} />}
    </ConfirmActionDialog>
  );
}

type Remark = { id: string; body: string; created_at: string; author: { full_name: string } | null; office: { name: string } | null };

export function RemarksPanel({ prId, remarks, canAdd }: { prId: string; remarks: Remark[]; canAdd: boolean }) {
  return (
    <div className="space-y-4">
      {canAdd && (
        <TextActionDialog
          trigger={<Button size="sm"><MessageSquarePlus className="mr-2 size-4" />Add remark</Button>}
          title="Add a remark?" description="Remarks are visible to every office involved in this PR, and followers are notified."
          label="Remark" required confirmLabel="Add remark" successMessage="Remark added"
          onConfirm={(t) => addRemark(prId, t)}
        />
      )}
      {remarks.length === 0 && <p className="text-sm text-muted-foreground">No remarks yet.</p>}
      <ul className="space-y-3">
        {remarks.map((r) => (
          <li key={r.id} className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">{r.author?.full_name} · {r.office?.name ?? "Admin"} · {formatDateTime(r.created_at)}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
