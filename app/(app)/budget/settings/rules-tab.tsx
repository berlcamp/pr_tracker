"use client";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { SaaoBookRow } from "@/lib/supabase/rows";
import { updateBook } from "../actions";

const PROVISIONAL = "Provisional — awaiting Budget Office confirmation";

// PROVISIONAL (R5) / PROVISIONAL (R11): both choices are switchable until the Budget Office confirms.
const RULES = [
  { id: "R5", field: "allotment_mode", title: "Allotment", options: [
    { value: "equals_adjusted", label: "Allotment equals Adjusted Appropriation" },
    { value: "recorded", label: "Allotment is the sum of recorded allotments" },
  ] },
  { id: "R11", field: "movement_rule", title: "Movement counting", options: [
    { value: "all_entered", label: "Count all entered movements" },
    { value: "approved_only", label: "Count approved movements only" },
  ] },
] as const;

type Field = (typeof RULES)[number]["field"];

function RuleRow({ book, rule }: { book: SaaoBookRow; rule: (typeof RULES)[number] }) {
  const current = book[rule.field as Field] as string;
  const [next, setNext] = useState<string | null>(null);
  const label = (v: string) => rule.options.find((o) => o.value === v)?.label ?? v;
  return (
    <div className="space-y-1.5">
      <Label>{rule.id} — {rule.title}</Label>
      <Select value={current} onValueChange={(v) => v !== current && setNext(v)}>
        <SelectTrigger aria-label={`${rule.id} ${rule.title}`} className="w-full max-w-md"><SelectValue /></SelectTrigger>
        <SelectContent>{rule.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{rule.id}: {PROVISIONAL}</p>
      <ConfirmActionDialog
        open={next !== null} onOpenChange={(o) => !o && setNext(null)}
        title={`Change rule ${rule.id}?`}
        description={<p>{rule.id} is provisional. Change <b>{rule.title}</b> from &ldquo;{label(current)}&rdquo; to &ldquo;{next ? label(next) : ""}&rdquo;?
          Live figures and new drafts will use the new rule; finalized reports keep the rule they were issued with.</p>}
        confirmLabel="Change rule" successMessage={`${rule.id} updated`}
        onConfirm={() => updateBook(book.id, { [rule.field]: next })}
      />
    </div>
  );
}

export function RulesTab({ book }: { book: SaaoBookRow | null }) {
  if (!book) return <p className="text-sm text-muted-foreground">Create a book first.</p>;
  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-muted-foreground">Rules for FY {book.fiscal_year} — {book.title}.</p>
      {RULES.map((r) => <RuleRow key={`${book.id}-${r.id}-${book[r.field as Field]}`} book={book} rule={r} />)}
    </div>
  );
}
