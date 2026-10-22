import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/page-skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}><CardContent className="space-y-2 p-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-12" /></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2"><CardContent className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-56 w-full" /></CardContent></Card>
        <Card><CardContent className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-56 w-full" /></CardContent></Card>
      </div>
      <CardSkeleton rows={3} />
    </div>
  );
}
