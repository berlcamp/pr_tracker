"use client";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { TextActionDialog } from "./remarks-panel";
import { addPrivateNote } from "@/app/(app)/prs/[id]/actions";

type Note = { id: string; body: string; created_at: string; author: { full_name: string } | null };

export function PrivateNotesPanel({ prId, notes, canAdd }: { prId: string; notes: Note[]; canAdd: boolean }) {
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" />Only your office can see these notes.</p>
      {canAdd && (
        <TextActionDialog
          trigger={<Button size="sm" variant="outline">Add private note</Button>}
          title="Add a private note?" description="Only staff of your office will see this note."
          label="Note" required confirmLabel="Add note" successMessage="Note added"
          onConfirm={(t) => addPrivateNote(prId, t)}
        />
      )}
      {notes.length === 0 && <p className="text-sm text-muted-foreground">No private notes.</p>}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-dashed p-3">
            <div className="text-xs text-muted-foreground">{n.author?.full_name} · {formatDateTime(n.created_at)}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
