"use client";
import { useState, type ReactNode } from "react";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { ActionResult } from "@/lib/actions/rpc";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PrSection } from "./pr-section";
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
    <PrSection title="Remarks" icon={MessageSquare} count={remarks.length}
      hint="Visible to every office involved in this PR."
      action={canAdd && (
        <TextActionDialog
          trigger={<Button size="sm" variant="outline"><MessageSquarePlus className="mr-2 size-4" />Add remark</Button>}
          title="Add a remark?" description="Remarks are visible to every office involved in this PR, and followers are notified."
          label="Remark" required confirmLabel="Add remark" successMessage="Remark added"
          onConfirm={(t) => addRemark(prId, t)}
        />
      )}>
      {remarks.length === 0
        ? <p className="py-2 text-center text-sm text-muted-foreground">No remarks yet.</p>
        : <NoteList items={remarks.map((r) => ({ ...r, meta: r.office?.name ?? "Admin" }))} />}
    </PrSection>
  );
}

/** Comment-style list shared by remarks and private notes. */
export function NoteList({ items, muted }: {
  items: { id: string; body: string; created_at: string; author: { full_name: string } | null; meta?: string }[]; muted?: boolean;
}) {
  return (
    <ul className="space-y-4">
      {items.map((n) => (
        <li key={n.id} className="flex gap-3">
          <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
            {initials(n.author?.full_name ?? "?")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{n.author?.full_name}</span>
              {n.meta && <> · {n.meta}</>} · <time dateTime={n.created_at}>{formatDateTime(n.created_at)}</time>
            </p>
            <p className={cn("mt-1 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap", muted ? "border border-dashed" : "bg-muted/60")}>{n.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
