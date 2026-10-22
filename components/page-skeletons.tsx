import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Placeholders shown by the route loading.tsx files while a page's server data loads.

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function CardSkeleton({ rows }: { rows?: number }) {
  return (
    <Card>
      <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
      <CardContent><TableSkeleton rows={rows} /></CardContent>
    </Card>
  );
}

export function PageSkeleton({ cards = 1, rows }: { cards?: number; rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      {Array.from({ length: cards }, (_, i) => <CardSkeleton key={i} rows={rows} />)}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Card><CardContent className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-9 w-full" /></div>
        ))}
      </CardContent></Card>
    </div>
  );
}
