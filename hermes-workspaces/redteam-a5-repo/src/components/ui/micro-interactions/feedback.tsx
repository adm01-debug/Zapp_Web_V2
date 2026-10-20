import * as React from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ============= MICRO FEEDBACK INDICATOR =============

interface MicroFeedbackProps {
  type: 'success' | 'error' | 'loading' | 'warning';
  show: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const feedbackColors = { success: 'bg-success', error: 'bg-destructive', loading: 'bg-primary', warning: 'bg-warning' };
const feedbackSizes = { sm: 'w-2 h-2', md: 'w-3 h-3', lg: 'w-4 h-4' };

export function MicroFeedback({ type, show, size = 'md' }: MicroFeedbackProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={cn('rounded-full', feedbackColors[type], feedbackSizes[size], type === 'loading' && 'animate-pulse')}
        />
      )}
    </AnimatePresence>
  );
}

// ============= LOADING INDICATORS =============

export function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className="w-2 h-2 rounded-full bg-primary"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function SpinnerGlow({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-3' };
  return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      className={cn('rounded-full border-primary border-t-transparent shadow-glow-primary-sm', sizes[size], className)}
    />
  );
}

// ============= SUCCESS/ERROR ANIMATIONS =============

interface FeedbackAnimationProps {
  type: 'success' | 'error';
  show: boolean;
  size?: number;
}

export function FeedbackAnimation({ type, show, size = 48 }: FeedbackAnimationProps) {
  const path = type === 'success' ? 'M7 13l3 3 7-7' : 'M18 6L6 18M6 6l12 12';
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
          className={cn('rounded-full flex items-center justify-center', type === 'success' ? 'bg-success/20' : 'bg-destructive/20')}
          style={{ width: size, height: size }}
        >
          <motion.svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none"
            stroke={type === 'success' ? 'hsl(142 76% 36%)' : 'hsl(var(--destructive))'}
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          >
            <motion.path d={path} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.1 }} />
          </motion.svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
