import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/page-skeletons";

export default function PrDetailLoading() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]" aria-busy="true" aria-label="Loading">
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-2"><Skeleton className="h-9 w-28" /><Skeleton className="h-9 w-28" /><Skeleton className="h-9 w-28" /></div>
        </div>
        <CardSkeleton rows={4} />
        <CardSkeleton rows={2} />
      </div>
      <Card><CardContent className="space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3"><Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
        ))}
      </CardContent></Card>
    </div>
  );
}
