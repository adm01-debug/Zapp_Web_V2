import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobilePullToRefreshProps {
  isRefreshing: boolean;
  pullProgress: number;
  pullDistance: number;
}

export function MobilePullToRefreshIndicator({
  isRefreshing,
  pullProgress,
  pullDistance,
}: MobilePullToRefreshProps) {
  const show = pullDistance > 10 || isRefreshing;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: Math.max(pullDistance, isRefreshing ? 48 : 0) }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center overflow-hidden bg-background/50"
        >
          {isRefreshing ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <motion.div
              animate={{ rotate: pullProgress >= 1 ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ArrowDown
                className={cn(
                  'w-5 h-5 transition-colors',
                  pullProgress >= 1 ? 'text-primary' : 'text-muted-foreground'
                )}
              />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
