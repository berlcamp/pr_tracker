"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { saveSetting } from "../actions";

type Key = "lgu_name" | "stuck_threshold_days" | "max_upload_mb";
const FIELDS: { key: Key; label: string; type: "text" | "number"; help: string }[] = [
  { key: "lgu_name", label: "LGU name (printed on routing slips)", type: "text", help: "e.g. City Government of San Isidro" },
  { key: "stuck_threshold_days", label: "Stuck threshold (days)", type: "number", help: "PRs held or in transit this long are highlighted. Whole days, 1–365." },
  { key: "max_upload_mb", label: "Max upload size (MB)", type: "number", help: "Whole megabytes, 1–50." },
];

export function SettingsForm({ values }: { values: Record<Key, string> }) {
  const [v, setV] = useState(values);
  return (
    <div className="max-w-xl space-y-6">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={f.key}>{f.label}</Label>
          <div className="flex gap-2">
            <Input id={f.key} type={f.type} step={f.type === "number" ? 1 : undefined} min={f.type === "number" ? 1 : undefined}
                   inputMode={f.type === "number" ? "numeric" : undefined} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            <ConfirmActionDialog
              trigger={<Button variant="outline" disabled={v[f.key] === values[f.key] || !v[f.key].trim()
                || (f.type === "number" && !/^\d+$/.test(v[f.key].trim()))}>Save</Button>}
              title={`Change "${f.label}"?`} description={<p>New value: <b>{v[f.key]}</b></p>}
              confirmLabel="Save setting" successMessage="Setting saved"
              onConfirm={() => saveSetting(f.key, f.type === "number" ? Number(v[f.key]) : v[f.key].trim())}
            />
          </div>
          <p className="text-xs text-muted-foreground">{f.help}</p>
        </div>
      ))}
    </div>
  );
}
