import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" role="status" aria-label="Carregando estatísticas">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="border-border/60">
          <CardContent className="pt-4 pb-3 px-4 space-y-3">
            <div className="flex items-start justify-between">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded" />
            </div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Carregando estatísticas do monitoramento...</span>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <Card role="status" aria-label="Carregando gráfico">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-7 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] flex items-end gap-1.5 px-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${25 + Math.random() * 65}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TimelineSkeleton() {
  return (
    <Card role="status" aria-label="Carregando atividade recente">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-24 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-[30px] w-[30px] rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <StatsCardsSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><ChartSkeleton /></div>
        <TimelineSkeleton />
      </div>
    </div>
  );
}
