"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectBook } from "./actions";

export function BookSwitcher({ books, selectedId }: { books: { id: string; label: string }[]; selectedId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Book</span>
      <Select value={selectedId ?? undefined} disabled={pending}
        onValueChange={(id) => startTransition(async () => { await selectBook(id); router.refresh(); })}>
        <SelectTrigger aria-label="Budget book" className="w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          {books.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
