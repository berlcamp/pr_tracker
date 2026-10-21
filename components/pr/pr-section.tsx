import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A titled card on the PR page: icon, title, optional count chip and a header action (e.g. an "Add" button). */
export function PrSection({ title, icon: Icon, count, action, hint, className, children }: {
  title: string; icon: LucideIcon; count?: number; action?: React.ReactNode; hint?: React.ReactNode;
  className?: string; children: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-5 py-2.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Icon className="size-4 text-muted-foreground" aria-hidden />{title}
            {count !== undefined && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
            )}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}
