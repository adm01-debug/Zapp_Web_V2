import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shapes com as mesmas alturas dos blocos reais da Visão Geral (28/70/32/73/95/259/220/173)
 * para não haver CLS quando os dados chegam.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-2.5 w-full min-w-0" data-testid="overview-skeleton">
      <Skeleton className="h-7 w-full rounded-lg" />
      <Skeleton className="h-[70px] w-full rounded-xl" />
      <Skeleton className="h-8 w-full rounded-lg" />
      <Skeleton className="h-[73px] w-full rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[95px] w-full rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.9fr_1fr_1fr] gap-2.5">
        <Skeleton className="h-[259px] w-full rounded-xl" />
        <Skeleton className="h-[259px] w-full rounded-xl" />
        <Skeleton className="h-[259px] w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5">
        <Skeleton className="h-[220px] w-full rounded-xl" />
        <Skeleton className="h-[220px] w-full rounded-xl" />
        <Skeleton className="h-[220px] w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[4fr_3fr_3fr] gap-2.5">
        <Skeleton className="h-[173px] w-full rounded-xl" />
        <Skeleton className="h-[173px] w-full rounded-xl" />
        <Skeleton className="h-[173px] w-full rounded-xl" />
      </div>
    </div>
  );
}
