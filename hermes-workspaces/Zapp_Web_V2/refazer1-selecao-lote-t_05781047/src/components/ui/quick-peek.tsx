import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface QuickPeekProps {
  /** Content to show on hover */
  children: React.ReactNode;
  /** Preview content (e.g. last 3 messages) */
  preview: React.ReactNode;
  /** Whether peek is enabled */
  enabled?: boolean;
  /** Delay before showing preview in ms */
  delay?: number;
  /** Additional className for the wrapper */
  className?: string;
}

/**
 * QuickPeek — hover to see a preview tooltip (e.g. last messages in a thread)
 * without leaving the current context.
 */
export function QuickPeek({
  children,
  preview,
  enabled = true,
  delay = 400,
  className,
}: QuickPeekProps) {
  const [show, setShow] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (!enabled) return;
    const t = setTimeout(() => setShow(true), delay);
    setTimer(t);
  };

  const handleLeave = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    setShow(false);
  };

  return (
    <div
      className={cn('relative', className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute left-full top-0 ml-2 z-50 w-72 max-h-64 overflow-y-auto',
              'rounded-xl border border-border bg-popover p-3 shadow-xl',
              'pointer-events-none'
            )}
          >
            <div className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">
              Preview
            </div>
            {preview}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
