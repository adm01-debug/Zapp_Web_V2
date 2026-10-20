import { useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Reply, Forward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/ui/use-mobile';

interface SwipeableMessageProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  className?: string;
}

const SWIPE_THRESHOLD = 60;

export function SwipeableMessage({
  children,
  onSwipeRight,
  onSwipeLeft,
  className,
}: SwipeableMessageProps) {
  const isMobile = useIsMobile();
  const x = useMotionValue(0);
  const isAnimating = useRef(false);

  // Right swipe → reply icon opacity
  const replyOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const replyScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.5, 1]);
  
  // Left swipe → forward icon opacity
  const forwardOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const forwardScale = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0.5]);

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (isAnimating.current) return;

      if (info.offset.x > SWIPE_THRESHOLD && onSwipeRight) {
        isAnimating.current = true;
        if (navigator.vibrate) navigator.vibrate(10);
        onSwipeRight();
        setTimeout(() => { isAnimating.current = false; }, 300);
      } else if (info.offset.x < -SWIPE_THRESHOLD && onSwipeLeft) {
        isAnimating.current = true;
        if (navigator.vibrate) navigator.vibrate(10);
        onSwipeLeft();
        setTimeout(() => { isAnimating.current = false; }, 300);
      }
    },
    [onSwipeRight, onSwipeLeft]
  );

  if (!isMobile) return <div className={className}>{children}</div>;

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Reply icon (left side, appears on right swipe) */}
      {onSwipeRight && (
        <motion.div
          className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary"
          style={{ opacity: replyOpacity, scale: replyScale }}
        >
          <Reply className="w-4 h-4" />
        </motion.div>
      )}

      {/* Forward icon (right side, appears on left swipe) */}
      {onSwipeLeft && (
        <motion.div
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground"
          style={{ opacity: forwardOpacity, scale: forwardScale }}
        >
          <Forward className="w-4 h-4" />
        </motion.div>
      )}

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: onSwipeLeft ? -80 : 0, right: onSwipeRight ? 80 : 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        style={{ x }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="relative z-10 touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
