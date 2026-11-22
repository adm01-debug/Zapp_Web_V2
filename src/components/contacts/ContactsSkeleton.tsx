import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ContactViewMode } from './ContactViewSwitcher';

const GRID_COLUMNS_CLASS: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
};

interface ContactsSkeletonProps {
  viewMode: ContactViewMode;
  gridColumns: number;
}

export function ContactsSkeleton({ viewMode, gridColumns }: ContactsSkeletonProps) {
  if (viewMode === 'kanban') {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 rounded-xl border border-border/30 p-3 space-y-3">
            <div className="h-5 w-20 rounded bg-muted animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (col * 3 + i) * 0.04 }}
                className="rounded-lg border border-border/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-3 w-32 rounded bg-muted/50 animate-pulse" />
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'analytics') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-border/30 p-5 space-y-4">
            <div className="h-5 w-28 rounded bg-muted animate-pulse" />
            <div className="h-40 rounded-lg bg-muted/40 animate-pulse" />
          </motion.div>
        ))}
      </div>
    );
  }

  if (viewMode === 'map') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="rounded-xl border border-border/30 h-[500px] bg-muted/20 animate-pulse flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-muted/50 animate-pulse mx-auto" />
          <div className="h-4 w-32 rounded bg-muted/40 animate-pulse mx-auto" />
        </div>
      </motion.div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className={cn("grid gap-4 max-[899px]:gap-[14px] max-[559px]:gap-[13px]", GRID_COLUMNS_CLASS[gridColumns] || GRID_COLUMNS_CLASS[4])}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden min-h-[120px] rounded-[13px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))]"
          >
            {/* Retrato: alturas espelham o card do design (base 286px). */}
            <div className="w-full h-[286px] max-[1600px]:h-[296px] max-[1399px]:h-[285px] max-[899px]:h-[311px] max-[559px]:h-[338px] bg-muted animate-shimmer" />
            <div className="px-4 pt-[14px] pb-[14px] max-[559px]:px-[19px] max-[559px]:pt-[18px] space-y-[7px]">
              <div className="h-6 w-32 rounded bg-muted animate-shimmer" />
              <div className="h-3 w-24 rounded bg-muted/70 animate-shimmer" />
              <div className="h-3 w-36 rounded bg-muted/60 animate-shimmer" />
            </div>
            <div className="mt-auto px-4 pb-[14px] max-[559px]:px-[19px] max-[559px]:pb-[16px] space-y-[9px] border-t border-[hsl(var(--contacts-line))] pt-[13px]">
              <div className="h-3 w-32 rounded bg-muted/60 animate-shimmer" />
              <div className="h-3 w-40 rounded bg-muted/60 animate-shimmer" />
            </div>
            <div className="px-4 pb-[14px] max-[559px]:px-[19px] max-[559px]:pb-[16px] pt-[11px] border-t border-[hsl(var(--contacts-line))] flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-muted/50 animate-shimmer" />
              <div className="h-3 w-16 rounded bg-muted/50 animate-shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-[9px]">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
            className="flex items-center gap-[13px] p-[9px] max-[559px]:gap-[10px] rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))]">
            <div className="w-[82px] max-[559px]:w-[73px] shrink-0 h-[102px] max-[559px]:h-[119px] rounded-[7px] bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-32 rounded bg-muted animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted/50 animate-pulse" />
              <div className="h-3 w-40 rounded bg-muted/40 animate-pulse" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  // Table skeleton
  return (
    <Card><CardContent className="p-4 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
          className="flex items-center gap-4 p-3">
          <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted/60 animate-pulse" />
          </div>
          <div className="h-5 w-16 rounded-full bg-muted/40 animate-pulse" />
        </motion.div>
      ))}
    </CardContent></Card>
  );
}
