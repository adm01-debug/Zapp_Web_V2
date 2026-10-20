import { useState, useRef, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DEFAULT_LEFT_ACTION, DEFAULT_RIGHT_ACTION } from './swipeActions';
import type { SwipeAction } from './swipeActions';

// Re-export for consumers
export type { SwipeAction } from './swipeActions';
export { SWIPE_ACTIONS } from './swipeActions';

interface SwipeableListItemProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  leftSecondaryAction?: SwipeAction;
  rightSecondaryAction?: SwipeAction;
  threshold?: number;
  secondaryThreshold?: number;
  velocityThreshold?: number;
  hapticFeedback?: boolean;
  showHints?: boolean;
  className?: string;
  disabled?: boolean;
}

export function SwipeableListItem({
  children,
  leftAction = DEFAULT_LEFT_ACTION,
  rightAction = DEFAULT_RIGHT_ACTION,
  leftSecondaryAction,
  rightSecondaryAction,
  threshold = 80,
  secondaryThreshold = 150,
  velocityThreshold = 500,
  hapticFeedback = true,
  showHints = false,
  className,
  disabled = false,
}: SwipeableListItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [triggeredAction, setTriggeredAction] = useState<'left' | 'right' | 'left-secondary' | 'right-secondary' | null>(null);
  const [showHint, setShowHint] = useState(showHints);
  const constraintsRef = useRef(null);
  const x = useMotionValue(0);

  const leftOpacity = useTransform(x, [0, threshold / 2, threshold], [0, 0.5, 1]);
  const leftScale = useTransform(x, [0, threshold / 2, threshold], [0.5, 0.8, 1]);
  const leftIconX = useTransform(x, [0, threshold], [-20, 20]);
  const rightOpacity = useTransform(x, [-threshold, -threshold / 2, 0], [1, 0.5, 0]);
  const rightScale = useTransform(x, [-threshold, -threshold / 2, 0], [1, 0.8, 0.5]);
  const rightIconX = useTransform(x, [-threshold, 0], [-20, 20]);

  const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'light') => {
    if (!hapticFeedback || !('vibrate' in navigator)) return;
    navigator.vibrate(intensity === 'light' ? 10 : intensity === 'medium' ? 25 : 50);
  };

  const handleDragStart = () => { setIsDragging(true); setShowHint(false); };

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const offsetX = info.offset.x;
    if (leftSecondaryAction && offsetX > secondaryThreshold && triggeredAction !== 'left-secondary') {
      setTriggeredAction('left-secondary'); triggerHaptic('heavy');
    } else if (offsetX > threshold && offsetX <= secondaryThreshold && triggeredAction !== 'left') {
      setTriggeredAction('left'); triggerHaptic('light');
    } else if (rightSecondaryAction && offsetX < -secondaryThreshold && triggeredAction !== 'right-secondary') {
      setTriggeredAction('right-secondary'); triggerHaptic('heavy');
    } else if (offsetX < -threshold && offsetX >= -secondaryThreshold && triggeredAction !== 'right') {
      setTriggeredAction('right'); triggerHaptic('light');
    } else if (Math.abs(offsetX) < threshold) {
      setTriggeredAction(null);
    }
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false); setTriggeredAction(null);
    if (disabled) return;
    const { x: offsetX } = info.offset;
    const { x: velocityX } = info.velocity;
    const fastRight = velocityX > velocityThreshold && offsetX > threshold / 2;
    const fastLeft = velocityX < -velocityThreshold && offsetX < -threshold / 2;

    if (leftSecondaryAction && offsetX > secondaryThreshold) { triggerHaptic('medium'); leftSecondaryAction.action(); }
    else if (offsetX > threshold || fastRight) { triggerHaptic('medium'); leftAction.action(); }
    else if (rightSecondaryAction && offsetX < -secondaryThreshold) { triggerHaptic('medium'); rightSecondaryAction.action(); }
    else if (offsetX < -threshold || fastLeft) { triggerHaptic('medium'); rightAction.action(); }
  };

  const isLeftSec = triggeredAction === 'left-secondary' && leftSecondaryAction;
  const isRightSec = triggeredAction === 'right-secondary' && rightSecondaryAction;
  const LeftIcon = isLeftSec ? leftSecondaryAction!.icon : leftAction.icon;
  const RightIcon = isRightSec ? rightSecondaryAction!.icon : rightAction.icon;
  const leftLabel = isLeftSec ? leftSecondaryAction!.label : leftAction.label;
  const rightLabel = isRightSec ? rightSecondaryAction!.label : rightAction.label;
  const leftColor = isLeftSec ? leftSecondaryAction!.color : leftAction.color;
  const rightColor = isRightSec ? rightSecondaryAction!.color : rightAction.color;
  const leftBg = isLeftSec ? leftSecondaryAction!.bgColor : leftAction.bgColor;
  const rightBg = isRightSec ? rightSecondaryAction!.bgColor : rightAction.bgColor;

  if (disabled) return <div className={className}>{children}</div>;

  return (
    <div ref={constraintsRef} className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* Left action */}
      <motion.div className={cn("absolute inset-y-0 left-0 flex items-center justify-start pl-6 w-40 rounded-l-xl transition-colors", leftBg)} style={{ opacity: leftOpacity }}>
        <motion.div style={{ scale: leftScale, x: leftIconX }} className="flex flex-col items-center gap-1">
          <AnimatePresence mode="wait">
            <motion.div key={isLeftSec ? 'secondary' : 'primary'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col items-center gap-1">
              <LeftIcon className={cn("w-6 h-6", leftColor)} />
              <span className={cn("text-xs font-medium whitespace-nowrap", leftColor)}>{leftLabel}</span>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Right action */}
      <motion.div className={cn("absolute inset-y-0 right-0 flex items-center justify-end pr-6 w-40 rounded-r-xl transition-colors", rightBg)} style={{ opacity: rightOpacity }}>
        <motion.div style={{ scale: rightScale, x: rightIconX }} className="flex flex-col items-center gap-1">
          <AnimatePresence mode="wait">
            <motion.div key={isRightSec ? 'secondary' : 'primary'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col items-center gap-1">
              <RightIcon className={cn("w-6 h-6", rightColor)} />
              <span className={cn("text-xs font-medium whitespace-nowrap", rightColor)}>{rightLabel}</span>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Hint */}
      <AnimatePresence>
        {showHint && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 pointer-events-none">
            <motion.div animate={{ x: [0, 30, 0, -30, 0] }} transition={{ duration: 2, repeat: 2, repeatDelay: 1 }} className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-16 bg-gradient-to-r from-transparent via-primary/10 to-transparent rounded-xl" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Draggable content */}
      <motion.div drag="x" dragConstraints={{ left: -200, right: 200 }} dragElastic={0.1} onDragStart={handleDragStart} onDrag={handleDrag} onDragEnd={handleDragEnd} style={{ x }} whileDrag={{ cursor: 'grabbing' }}
        className={cn("relative bg-card z-10 touch-pan-y rounded-xl", isDragging && "cursor-grabbing shadow-lg")}>
        {children}
      </motion.div>
    </div>
  );
}
