"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { SaaoBookRow } from "@/lib/supabase/rows";
import { updateBook } from "../actions";

const EXTRA_KEYS = [
  { key: "cna_1", label: "Column CNA (1) heading" },
  { key: "cna_2", label: "Column CNA (2) heading" },
  { key: "cna_3", label: "Column CNA (3) heading" },
  { key: "savings", label: "Savings column heading" },
] as const;

function LabelsForm({ book }: { book: SaaoBookRow }) {
  const labels = (book.extra_labels ?? {}) as Record<string, string>;
  const header = Array.isArray(book.header_lines) ? (book.header_lines as unknown[]).map(String) : [];
  const [extra, setExtra] = useState<Record<string, string>>(
    Object.fromEntries(EXTRA_KEYS.map((k) => [k.key, labels[k.key] ?? ""])));
  const [lines, setLines] = useState(header.join("\n"));
  const [name, setName] = useState(book.certifier_name ?? "");
  const [title, setTitle] = useState(book.certifier_title ?? "");

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm text-muted-foreground">Report headings for FY {book.fiscal_year} — {book.title}.</p>
      {EXTRA_KEYS.map((k) => (
        <div key={k.key} className="space-y-1.5">
          <Label htmlFor={`l-${k.key}`}>{k.label}</Label>
          <Input id={`l-${k.key}`} value={extra[k.key]} onChange={(e) => setExtra({ ...extra, [k.key]: e.target.value })} />
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="l-header">Report header lines (one per line)</Label>
        <Textarea id="l-header" rows={4} value={lines} onChange={(e) => setLines(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="l-cert-name">Certifier name</Label>
        <Input id="l-cert-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="l-cert-title">Certifier title</Label>
        <Input id="l-cert-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <ConfirmActionDialog
        trigger={<Button variant="outline">Save labels &amp; header</Button>}
        title="Save labels and header?" description={<p>Applies to live views and new drafts. Finalized reports are not changed.</p>}
        confirmLabel="Save" successMessage="Labels saved"
        onConfirm={() => updateBook(book.id, {
          extra_labels: Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, v.trim()])),
          header_lines: lines.split("\n").map((l) => l.trim()).filter(Boolean),
          certifier_name: name, certifier_title: title,
        })}
      />
    </div>
  );
}

export function LabelsTab({ book }: { book: SaaoBookRow | null }) {
  if (!book) return <p className="text-sm text-muted-foreground">Create a book first.</p>;
  // Re-key on the saved values so the form resets after a refresh.
  return <LabelsForm key={book.id} book={book} />;
}
