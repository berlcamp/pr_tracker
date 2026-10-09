import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MovementBadge } from "./movement-badge";
import { formatDate, formatPeso, locationLine } from "@/lib/format";
import type { PrOverviewRow } from "@/lib/supabase/rows";
import type { MovementState } from "@/lib/types";

export function PrHeader({ pr, actions }: { pr: PrOverviewRow; actions?: React.ReactNode }) {
  const state = pr.movement_state as MovementState;
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Routing Slip No.</div>
            <h1 className="font-mono text-2xl font-semibold">{pr.routing_slip_no}</h1>
            <div className="mt-1 text-sm text-muted-foreground">PR No.: <span className="font-medium text-foreground">{pr.pr_no ?? "Not yet assigned"}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <MovementBadge state={state} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/print/slips?ids=${pr.id}&layout=single`} target="_blank"><Printer className="mr-2 size-4" />Print routing slip</Link>
            </Button>
          </div>
        </div>
        <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium" data-testid="location-line">
          {locationLine({
            movement_state: state, current_office_name: pr.current_office_name!, current_status_label: pr.current_status_label,
            current_purpose: pr.current_purpose, current_since: pr.current_since!, route_step: pr.route_step!, total_steps: pr.total_steps!,
          })}
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted-foreground">Origin</dt><dd className="font-medium">{pr.origin_office_name}</dd></div>
          <div><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{formatDate(pr.pr_date!)}</dd></div>
          <div><dt className="text-muted-foreground">Amount</dt><dd className="font-medium tabular-nums">{formatPeso(Number(pr.amount))}</dd></div>
          <div><dt className="text-muted-foreground">Mode of procurement</dt><dd className="font-medium">{pr.mode_of_procurement ?? "—"}</dd></div>
        </dl>
        {actions}
      </CardContent>
    </Card>
  );
}
