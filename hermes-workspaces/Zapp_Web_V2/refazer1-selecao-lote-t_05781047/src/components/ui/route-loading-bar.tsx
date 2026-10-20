import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RouteLoadingBarProps {
  isLoading: boolean;
  className?: string;
}

/**
 * NProgress-style thin loading bar at the top of the viewport.
 * Shows during lazy route/component loading.
 */
export function RouteLoadingBar({ isLoading, className }: RouteLoadingBarProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setVisible(true);
      setProgress(0);
      
      // Simulate incremental progress
      const t1 = setTimeout(() => setProgress(30), 100);
      const t2 = setTimeout(() => setProgress(60), 400);
      const t3 = setTimeout(() => setProgress(80), 800);
      const t4 = setTimeout(() => setProgress(90), 1500);
      
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    } else {
      setProgress(100);
      const hide = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(hide);
    }
  }, [isLoading]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn('fixed top-0 left-0 right-0 z-[100] h-[2px]', className)}
        >
          <motion.div
            className="h-full bg-primary rounded-r-full"
            style={{ width: `${progress}%` }}
            animate={{ width: `${progress}%` }}
            transition={{
              duration: progress === 100 ? 0.2 : 0.8,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
          {/* Glow effect */}
          <motion.div
            className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-primary/40 to-transparent rounded-r-full"
            animate={{ opacity: progress < 100 ? [0.4, 0.8, 0.4] : 0 }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
