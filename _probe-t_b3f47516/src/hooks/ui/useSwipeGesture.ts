import { useRef, useCallback, useState } from 'react';

interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}

interface SwipeState {
  offsetX: number;
  isSwiping: boolean;
  direction: 'left' | 'right' | null;
}

/**
 * Hook for swipe gestures on touch devices.
 * Returns handlers and current swipe state for visual feedback.
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  enabled = true,
}: UseSwipeGestureOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isTracking = useRef(false);
  const [swipeState, setSwipeState] = useState<SwipeState>({
    offsetX: 0,
    isSwiping: false,
    direction: null,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = startX.current;
    isTracking.current = true;
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || !isTracking.current) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = touch.clientY - startY.current;
    
    // Cancel if vertical scroll is dominant
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      isTracking.current = false;
      setSwipeState({ offsetX: 0, isSwiping: false, direction: null });
      return;
    }
    
    currentX.current = touch.clientX;
    
    // Clamp the offset for visual feedback
    const clampedOffset = Math.max(-threshold * 1.5, Math.min(threshold * 1.5, deltaX));
    const direction = deltaX > 0 ? 'right' : deltaX < 0 ? 'left' : null;
    
    setSwipeState({
      offsetX: clampedOffset,
      isSwiping: Math.abs(deltaX) > 10,
      direction,
    });
  }, [enabled, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isTracking.current) return;
    isTracking.current = false;
    
    const deltaX = currentX.current - startX.current;
    
    if (deltaX > threshold && onSwipeRight) {
      onSwipeRight();
    } else if (deltaX < -threshold && onSwipeLeft) {
      onSwipeLeft();
    }
    
    setSwipeState({ offsetX: 0, isSwiping: false, direction: null });
  }, [enabled, threshold, onSwipeLeft, onSwipeRight]);

  return {
    swipeState,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
