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
      <div className={cn("grid gap-3", GRID_COLUMNS_CLASS[gridColumns] || GRID_COLUMNS_CLASS[4])}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col min-h-[164px] rounded-[14px] border border-border/70 bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 rounded-full bg-muted animate-shimmer shrink-0" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-4 w-28 rounded bg-muted animate-shimmer" />
                <div className="h-5 w-20 rounded-full bg-muted animate-shimmer" />
                <div className="h-3 w-24 rounded bg-muted/70 animate-shimmer" />
              </div>
            </div>
            {/* space-y-1 matches ContactCard (was 1.5) */}
            <div className="mt-3 space-y-1">
              <div className="h-3 w-32 rounded bg-muted/60 animate-shimmer" />
              <div className="h-3 w-40 rounded bg-muted/60 animate-shimmer" />
            </div>
            {/* pt-2 matches ContactCard (was pt-3) */}
            <div className="mt-auto pt-2 flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-muted/50 animate-shimmer" />
              <div className="flex items-center gap-1.5">
                <div className="w-9 h-9 rounded-[10px] bg-muted animate-shimmer" />
                <div className="w-9 h-9 rounded-[10px] bg-muted animate-shimmer" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
            className="flex items-center gap-4 px-4 py-3 rounded-xl border border-border/30">
            <div className="w-4 h-4 rounded bg-muted animate-pulse" />
            <div className="w-11 h-11 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted/50 animate-pulse" />
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
