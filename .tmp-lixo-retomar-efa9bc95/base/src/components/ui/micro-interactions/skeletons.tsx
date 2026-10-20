import * as React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// ============= SKELETON PULSE =============

interface SkeletonPulseProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const roundedClasses = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' };

export function SkeletonPulse({ className, rounded = 'md' }: SkeletonPulseProps) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', roundedClasses[rounded], className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

// ============= CONTENT SKELETON =============

interface ContentSkeletonProps {
  type: 'card' | 'list-item' | 'message' | 'avatar' | 'stat';
  count?: number;
}

export function ContentSkeleton({ type, count = 1 }: ContentSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  switch (type) {
    case 'card':
      return (
        <div className="space-y-4">
          {items.map((i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
              className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-4 mb-4">
                <SkeletonPulse className="w-12 h-12" rounded="full" />
                <div className="space-y-2 flex-1">
                  <SkeletonPulse className="h-4 w-1/3" />
                  <SkeletonPulse className="h-3 w-1/2" />
                </div>
              </div>
              <SkeletonPulse className="h-4 w-full mb-2" />
              <SkeletonPulse className="h-4 w-4/5" />
            </motion.div>
          ))}
        </div>
      );
    case 'list-item':
      return (
        <div className="space-y-2">
          {items.map((i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 p-3 rounded-lg">
              <SkeletonPulse className="w-10 h-10" rounded="full" />
              <div className="flex-1 space-y-2">
                <SkeletonPulse className="h-4 w-1/2" />
                <SkeletonPulse className="h-3 w-3/4" />
              </div>
              <SkeletonPulse className="h-3 w-16" />
            </motion.div>
          ))}
        </div>
      );
    case 'message':
      return (
        <div className="space-y-3">
          {items.map((i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className={cn('flex gap-2', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
              {i % 2 === 0 && <SkeletonPulse className="w-8 h-8" rounded="full" />}
              <SkeletonPulse className={cn('h-12', i % 2 === 0 ? 'w-48' : 'w-40')} rounded="xl" />
            </motion.div>
          ))}
        </div>
      );
    case 'avatar':
      return (
        <div className="flex gap-2">
          {items.map((i) => (
            <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.05, type: 'spring' }}>
              <SkeletonPulse className="w-10 h-10" rounded="full" />
            </motion.div>
          ))}
        </div>
      );
    case 'stat':
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
              className="p-4 rounded-xl border border-border bg-card">
              <SkeletonPulse className="h-4 w-1/2 mb-3" />
              <SkeletonPulse className="h-8 w-3/4 mb-2" />
              <SkeletonPulse className="h-3 w-1/3" />
            </motion.div>
          ))}
        </div>
      );
    default:
      return null;
  }
}
