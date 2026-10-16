import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// Animated counter
interface AnimatedCounterProps { value: number; duration?: number; className?: string; }

export function AnimatedCounter({ value, duration = 1, className }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevRef = { current: 0 };

  useEffect(() => {
    let startTime: number;
    let frame: number;
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;

    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / (duration * 1000), 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + diff * ease));
      if (progress < 1) frame = requestAnimationFrame(animate);
      else prevRef.current = value;
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <motion.span key={displayValue} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={className}>{displayValue.toLocaleString()}</motion.span>;
}

// Animated progress bar
export function AnimatedProgress({ value, max = 100, className, showValue = false, size = 'md' }: { value: number; max?: number; className?: string; showValue?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const pct = Math.min((value / max) * 100, 100);
  const h = { sm: 'h-1', md: 'h-2', lg: 'h-3' };
  return (
    <div className={cn('relative w-full', className)}>
      <div className={cn('w-full bg-muted rounded-full overflow-hidden', h[size])}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }} className="h-full bg-primary rounded-full" />
      </div>
      {showValue && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute right-0 -top-6 text-xs text-muted-foreground">{Math.round(pct)}%</motion.span>}
    </div>
  );
}

// Presence wrapper
export function Presence({ children, mode = 'wait' }: { children: ReactNode; mode?: 'wait' | 'sync' | 'popLayout' }) {
  return <AnimatePresence mode={mode}>{children}</AnimatePresence>;
}

// Enhanced stagger container
export function StaggerContainerEnhanced({ children, staggerDelay = 0.1, delayChildren = 0.1, className }: { children: ReactNode; staggerDelay?: number; className?: string; delayChildren?: number }) {
  const v: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: staggerDelay, delayChildren } } };
  return <motion.div variants={v} initial="hidden" animate="visible" className={className}>{children}</motion.div>;
}

// Slide transition
type SlideDirection = 'left' | 'right' | 'up' | 'down';

export function SlideTransition({ children, direction = 'up', distance = 20, className }: { children: ReactNode; direction?: SlideDirection; distance?: number; className?: string }) {
  const init = direction === 'left' ? { opacity: 0, x: distance } : direction === 'right' ? { opacity: 0, x: -distance } : direction === 'up' ? { opacity: 0, y: distance } : { opacity: 0, y: -distance };
  return <motion.div initial={init} animate={{ opacity: 1, x: 0, y: 0 }} exit={init} transition={{ duration: 0.3, ease: 'easeOut' }} className={className}>{children}</motion.div>;
}

// Hover scale
export function HoverScale({ children, className, scale = 1.02 }: { children: ReactNode; className?: string; scale?: number }) {
  return <motion.div whileHover={{ scale }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2 }} className={className}>{children}</motion.div>;
}

// Animated list
export function AnimatedList({ children, className }: { children: ReactNode; className?: string }) {
  return <AnimatePresence mode="popLayout"><motion.ul className={className} layout>{children}</motion.ul></AnimatePresence>;
}

export function AnimatedListItem({ children, className, layoutId }: { children: ReactNode; className?: string; layoutId?: string }) {
  return (
    <motion.li layout layoutId={layoutId} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2, layout: { duration: 0.3 } }} className={className}>{children}</motion.li>
  );
}

// Typewriter
export function Typewriter({ text, speed = 50, className, onComplete }: { text: string; speed?: number; className?: string; onComplete?: () => void }) {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => { if (i <= text.length) { setDisplay(text.slice(0, i)); i++; } else { clearInterval(iv); onComplete?.(); } }, speed);
    return () => clearInterval(iv);
  }, [text, speed, onComplete]);

  return <span className={className}>{display}{display.length < text.length && <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>|</motion.span>}</span>;
}
