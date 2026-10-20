"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTHS, monthEndLabel } from "@/lib/saao/cutoff";

/** "As of" month-end selector for one fiscal year. */
export function CutoffSelect({ fiscalYear, month, onChange }: { fiscalYear: number; month: number; onChange: (month: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">As of</span>
      <Select value={String(month)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger aria-label="As of month" className="w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MONTHS.map((name, i) => <SelectItem key={name} value={String(i + 1)}>{monthEndLabel(fiscalYear, i + 1)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
