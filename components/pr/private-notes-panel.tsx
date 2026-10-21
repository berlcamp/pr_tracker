"use client";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoteList, TextActionDialog } from "./remarks-panel";
import { PrSection } from "./pr-section";
import { addPrivateNote } from "@/app/(app)/prs/[id]/actions";

type Note = { id: string; body: string; created_at: string; author: { full_name: string } | null };

export function PrivateNotesPanel({ prId, notes, canAdd }: { prId: string; notes: Note[]; canAdd: boolean }) {
  return (
    <PrSection title="Private notes" icon={Lock} count={notes.length}
      hint="Only staff of your office can see these notes."
      action={canAdd && (
        <TextActionDialog
          trigger={<Button size="sm" variant="outline"><NotebookPen className="mr-2 size-4" />Add note</Button>}
          title="Add a private note?" description="Only staff of your office will see this note."
          label="Note" required confirmLabel="Add note" successMessage="Note added"
          onConfirm={(t) => addPrivateNote(prId, t)}
        />
      )}>
      {notes.length === 0
        ? <p className="py-2 text-center text-sm text-muted-foreground">No private notes.</p>
        : <NoteList items={notes} muted />}
    </PrSection>
  );
}
