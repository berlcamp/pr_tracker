import Link from "next/link";
import { MapPin, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MovementBadge } from "./movement-badge";
import { locationLine } from "@/lib/format";
import type { PrOverviewRow } from "@/lib/supabase/rows";
import type { MovementState } from "@/lib/types";

export function PrHeader({ pr, actions }: { pr: PrOverviewRow; actions?: React.ReactNode }) {
  const state = pr.movement_state as MovementState;
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Routing Slip No.</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{pr.routing_slip_no}</h1>
              <MovementBadge state={state} />
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              PR No.: {pr.pr_no
                ? <span className="font-medium text-foreground" data-testid="pr-no">{pr.pr_no}</span>
                : <span className="italic">Not yet assigned</span>}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/print/slips?ids=${pr.id}&layout=single`} target="_blank"><Printer className="mr-2 size-4" />Print routing slip</Link>
          </Button>
        </div>
        <p className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm font-medium">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span data-testid="location-line">
            {locationLine({
              movement_state: state, current_office_name: pr.current_office_name!, current_status_label: pr.current_status_label,
              current_purpose: pr.current_purpose, current_since: pr.current_since!, route_step: pr.route_step!, total_steps: pr.total_steps!,
            })}
          </span>
        </p>
        {actions}
      </CardContent>
    </Card>
  );
}
