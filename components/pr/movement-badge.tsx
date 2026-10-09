import { Badge } from "@/components/ui/badge";
import { MOVEMENT_LABELS } from "@/lib/format";
import type { MovementState } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<MovementState, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  in_transit: "bg-amber-100 text-amber-800 border-amber-200",
  received: "bg-blue-100 text-blue-800 border-blue-200",
  returned: "bg-orange-100 text-orange-800 border-orange-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
};

export function MovementBadge({ state }: { state: MovementState }) {
  return <Badge variant="outline" className={cn("font-medium", STYLES[state])}>{MOVEMENT_LABELS[state]}</Badge>;
}
