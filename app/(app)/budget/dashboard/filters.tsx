"use client";
// One filter row above everything it scopes (spec §8.2): cutoff (finalized cutoffs only), section,
// and the encoder+ "Preview draft" toggle. The book is chosen by the layout's book switcher.
import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

export function ViewFilters({ params, cutoffs, reportId, sections, sectionSeq, canPreview, preview }: {
  params: Record<string, string>;
  cutoffs: { id: string; label: string }[];
  reportId: string | null;
  sections?: { seq: number; label: string }[];
  sectionSeq?: number;
  canPreview: boolean;
  preview: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" aria-busy={pending}>
      {!preview && cutoffs.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">As of</span>
          <Select value={reportId ?? undefined} onValueChange={(v) => go({ report: v, section: null })} disabled={pending}>
            <SelectTrigger aria-label="Cutoff" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {cutoffs.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {sections && sections.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Section</span>
          <Select value={sectionSeq === undefined ? ALL : String(sectionSeq)} disabled={pending}
            onValueChange={(v) => go({ section: v === ALL ? null : v })}>
            <SelectTrigger aria-label="Section" className="w-72 max-w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.seq} value={String(s.seq)}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {canPreview && (
        <Button type="button" size="sm" variant={preview ? "default" : "outline"} disabled={pending}
          className={preview ? "bg-amber-600 text-white hover:bg-amber-700" : undefined} aria-pressed={preview}
          onClick={() => go(preview ? { preview: null, section: null } : { preview: "draft", report: null, section: null })}>
          {preview ? "Exit draft preview" : "Preview draft"}
        </Button>
      )}
    </div>
  );
}
