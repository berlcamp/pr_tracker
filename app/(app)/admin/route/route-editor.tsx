"use client";
import { useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { saveRoute } from "../actions";

type Office = { id: string; name: string };
type Step = { key: string; office_id: string; purpose: string };

function SortableStep({ step, index, offices, onChange, onRemove }: {
  step: Step; index: number; offices: Office[]; onChange: (s: Step) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.key });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
        className="flex items-center gap-2 rounded-md border bg-card p-2">
      <button type="button" aria-label={`Drag step ${index + 1}`} className="cursor-grab text-muted-foreground" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
      <span className="w-8 text-sm font-semibold">{index + 1}</span>
      <Select value={step.office_id} onValueChange={(v) => onChange({ ...step, office_id: v })}>
        <SelectTrigger className="w-64" aria-label={`Step ${index + 1} office`}><SelectValue placeholder="Office" /></SelectTrigger>
        <SelectContent>{offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
      <Input aria-label={`Step ${index + 1} purpose`} value={step.purpose} onChange={(e) => onChange({ ...step, purpose: e.target.value })} placeholder="Purpose, e.g. For approval" />
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${index + 1}`} onClick={onRemove}><Trash2 className="size-4" /></Button>
    </li>
  );
}

export function RouteEditor({ initial, offices }: { initial: { id: string; office_id: string; purpose: string }[]; offices: Office[] }) {
  const counter = useRef(0);
  const [steps, setSteps] = useState<Step[]>(initial.map((s) => ({ key: s.id, office_id: s.office_id, purpose: s.purpose })));
  const name = (id: string) => offices.find((o) => o.id === id)?.name ?? "?";
  const valid = steps.length > 0 && steps.every((s) => s.office_id && s.purpose.trim());

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setSteps((s) => arrayMove(s, s.findIndex((x) => x.key === e.active.id), s.findIndex((x) => x.key === e.over!.id)));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Step 0 is always the originating office. The same office may appear more than once.</p>
      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <SortableStep key={s.key} step={s} index={i} offices={offices}
                onChange={(n) => setSteps((all) => all.map((x) => (x.key === s.key ? n : x)))}
                onRemove={() => setSteps((all) => all.filter((x) => x.key !== s.key))} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setSteps((s) => [...s, { key: `new-${counter.current++}`, office_id: "", purpose: "" }])}>
          <Plus className="mr-2 size-4" />Add step
        </Button>
        <ConfirmActionDialog
          trigger={<Button disabled={!valid}>Save route</Button>}
          title="Save the default route?"
          description={<div><p className="mb-2">PRs already in progress keep their step number. New suggestions use this route:</p>
            <ol className="list-decimal pl-5 text-sm">{steps.map((s) => <li key={s.key}>{name(s.office_id)} · {s.purpose}</li>)}</ol></div>}
          confirmLabel="Save route" successMessage="Route saved" canConfirm={valid}
          onConfirm={() => saveRoute(steps.map(({ office_id, purpose }) => ({ office_id, purpose: purpose.trim() })))}
        />
      </div>
    </div>
  );
}
