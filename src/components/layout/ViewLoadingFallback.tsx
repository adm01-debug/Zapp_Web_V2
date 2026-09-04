import { Skeleton, SkeletonCard, SkeletonText } from '@/components/ui/skeleton';

export function ViewLoadingFallback({ noPadding = false }: { noPadding?: boolean }) {
  return (
    <div
      className={`flex flex-col h-full w-full min-w-0 gap-6 animate-fade-in${noPadding ? '' : ' p-6'}`}
      role="status"
      aria-busy="true"
      aria-label="Carregando módulo"
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} className="p-4">
            <Skeleton className="h-3 w-20 mb-3" delay={i * 80} />
            <Skeleton className="h-7 w-16 mb-1" delay={i * 80 + 40} />
            <Skeleton className="h-3 w-12" delay={i * 80 + 80} />
          </SkeletonCard>
        ))}
      </div>

      {/* Content skeleton */}
      <SkeletonCard className="flex-1 p-5">
        <SkeletonText lines={4} />
      </SkeletonCard>
      <span className="sr-only">Carregando conteúdo do módulo...</span>
    </div>
  );
}
