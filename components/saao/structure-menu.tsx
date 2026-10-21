"use client";
// Row menu of the SAAO workspace: add, indent/outdent, move and edit rows (spec §8.3).
import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { ActionResult } from "@/lib/actions/rpc";
import type { SaaoClassificationRow, SaaoNodeRow } from "@/lib/supabase/rows";
import { addNode, deleteNode, moveNode, updateNode } from "@/app/(app)/budget/actions";

type Kind = "line" | "group" | "classification" | "note";
const DEFAULT_LABEL: Record<Exclude<Kind, "classification">, string> = { line: "New line", group: "New group", note: "New note" };
const HEADING_KINDS = new Set(["section", "group", "classification"]);
const NONE = "none";

export type StructureContext = {
  node: SaaoNodeRow;
  parent: SaaoNodeRow | null;
  prev: SaaoNodeRow | null;
  next: SaaoNodeRow | null;
};

type Dialog = { type: "classification"; where: "below" | "child" } | { type: "set-classification" } | { type: "office" } | { type: "total-label" } | { type: "delete" };

export function StructureMenu({
  ctx, bookId, classifications, offices, open, onOpenChange, focusGrid, onAdded,
}: {
  ctx: StructureContext;
  bookId: string;
  classifications: SaaoClassificationRow[];
  offices: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusGrid: () => void;
  /** Called with the new node id so the grid can select it once the row arrives. */
  onAdded: (id: string, edit: boolean) => void;
}) {
  const { node, parent, prev, next } = ctx;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [value, setValue] = useState("");
  const openingDialog = useRef(false);
  const isHeading = HEADING_KINDS.has(node.kind);
  const activeClassifications = classifications.filter((c) => c.active);

  async function run<T>(p: Promise<ActionResult<T>>, onOk?: (data: T) => void) {
    try {
      const res = await p;
      if (!res.ok) toast.error(res.error);
      else onOk?.(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const add = (kind: Kind, where: "below" | "child", label: string, classificationId: string | null = null) =>
    addNode({
      bookId, kind, label, accountCode: null, classificationId,
      parentId: where === "below" ? node.parent_id : node.id,
      afterId: where === "below" ? node.id : null,
    });

  function quickAdd(kind: Exclude<Kind, "classification">, where: "below" | "child") {
    void run(add(kind, where, DEFAULT_LABEL[kind]), (id) => onAdded(id, true));
  }

  function openDialog(d: Dialog, initial = "") {
    openingDialog.current = true;
    setValue(initial);
    setDialog(d);
  }

  const close = (o: boolean) => { if (!o) { setDialog(null); focusGrid(); } };
  const clsName = (id: string) => classifications.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Row actions for ${node.label}`}
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (!openingDialog.current) focusGrid();
          openingDialog.current = false;
        }}>
          <DropdownMenuItem onSelect={() => quickAdd("line", "below")}>Add line below</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => quickAdd("group", "below")}>Add group below</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDialog({ type: "classification", where: "below" })}>Add classification below…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => quickAdd("note", "below")}>Add note below</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!isHeading}>Add child</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => quickAdd("line", "child")}>Line</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => quickAdd("group", "child")}>Group</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openDialog({ type: "classification", where: "child" })}>Classification…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => quickAdd("note", "child")}>Note</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          {/* Indent = move under the previous sibling (as its last child); Outdent = move after the parent. */}
          <DropdownMenuItem disabled={!prev || !HEADING_KINDS.has(prev.kind)} onSelect={() => prev && void run(moveNode(node.id, prev.id, null))}>
            Indent
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!parent} onSelect={() => parent && void run(moveNode(node.id, parent.parent_id, parent.id))}>
            Outdent
          </DropdownMenuItem>
          {/* "after null" means last, so moving up places the previous sibling after this row instead. */}
          <DropdownMenuItem disabled={!prev} onSelect={() => prev && void run(moveNode(prev.id, node.parent_id, node.id))}>Move up</DropdownMenuItem>
          <DropdownMenuItem disabled={!next} onSelect={() => next && void run(moveNode(node.id, node.parent_id, next.id))}>Move down</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={node.kind !== "line" && node.kind !== "classification"}
            onSelect={() => openDialog({ type: "set-classification" }, node.classification_id ?? NONE)}>
            Set classification…
          </DropdownMenuItem>
          {node.kind === "section" && (
            <DropdownMenuItem onSelect={() => openDialog({ type: "office" }, node.office_id ?? NONE)}>Link to PR office…</DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!isHeading} onSelect={() => openDialog({ type: "total-label" }, node.total_label ?? "")}>
            Edit total label…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => openDialog({ type: "delete" })}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog?.type === "classification" && (
        <ConfirmActionDialog open onOpenChange={close} title={dialog.where === "below" ? "Add classification below" : "Add classification under this row"}
          description={<p>A classification heading groups lines as PS, MOOE, CO or another classification.</p>}
          confirmLabel="Add" successMessage="Classification added" canConfirm={!!value && value !== NONE}
          onConfirm={() => add("classification", dialog.where, clsName(value), value)}
          onSuccess={(id) => onAdded(id, false)}>
          <ClassificationSelect value={value} onChange={setValue} options={activeClassifications} />
        </ConfirmActionDialog>
      )}
      {dialog?.type === "set-classification" && (
        <ConfirmActionDialog open onOpenChange={close} title="Set classification"
          description={node.kind === "line"
            ? <p>A line takes its classification from the nearest classification heading above it. Choose one here only to override that.</p>
            : <p>The classification this heading stands for.</p>}
          confirmLabel="Save" successMessage="Classification saved" canConfirm={node.kind === "line" || value !== NONE}
          onConfirm={() => updateNode(node.id, { classification_id: value === NONE ? null : value })}>
          <ClassificationSelect value={value} onChange={setValue} options={activeClassifications} allowNone={node.kind === "line"} />
        </ConfirmActionDialog>
      )}
      {dialog?.type === "office" && (
        <ConfirmActionDialog open onOpenChange={close} title="Link to PR office"
          description={<p>Informational only: links this section to an office in the PR Tracker.</p>}
          confirmLabel="Save" successMessage="Office link saved"
          onConfirm={() => updateNode(node.id, { office_id: value === NONE ? null : value })}>
          <Label>Office</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger aria-label="Office" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No office</SelectItem>
              {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </ConfirmActionDialog>
      )}
      {dialog?.type === "total-label" && (
        <ConfirmActionDialog open onOpenChange={close} title="Edit total label"
          description={<p>Caption of this row&apos;s subtotal. Leave blank for &ldquo;TOTAL {node.label}&rdquo;.</p>}
          confirmLabel="Save" successMessage="Total label saved"
          onConfirm={() => updateNode(node.id, { total_label: value.trim() || null })}>
          <Label htmlFor="total-label">Total label</Label>
          <Input id="total-label" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`TOTAL ${node.label}`} />
        </ConfirmActionDialog>
      )}
      {dialog?.type === "delete" && (
        <ConfirmActionDialog open onOpenChange={close} title="Delete row?" destructive confirmLabel="Delete" successMessage="Row deleted"
          description={<p>&ldquo;{node.label}&rdquo; will be removed. A line with figures, or a heading with rows under it, cannot be deleted.</p>}
          onConfirm={() => deleteNode(node.id)} />
      )}
    </>
  );
}

function ClassificationSelect({ value, onChange, options, allowNone }: {
  value: string; onChange: (v: string) => void; options: SaaoClassificationRow[]; allowNone?: boolean;
}) {
  return (
    <>
      <Label>Classification</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger aria-label="Classification" className="w-full"><SelectValue placeholder="Choose a classification" /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>None (use the heading above)</SelectItem>}
          {options.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  );
}
