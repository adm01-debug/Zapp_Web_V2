import { useRef, useCallback, useEffect } from 'react';

interface UseSwipeNavigationOptions {
  onSwipeBack?: () => void;
  onSwipeForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  /** Min horizontal distance (px) to trigger navigation */
  threshold?: number;
  /** Max edge zone width (px) where swipe starts */
  edgeWidth?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

/**
 * iOS/Android-style edge swipe for back/forward navigation.
 * Swipe from left edge → go back; swipe from right edge → go forward.
 * Only activates on touch devices within the edge zones.
 */
export function useSwipeNavigation({
  onSwipeBack,
  onSwipeForward,
  canGoBack = false,
  canGoForward = false,
  threshold = 80,
  edgeWidth = 24,
  enabled = true,
}: UseSwipeNavigationOptions) {
  const touchStart = useRef<{ x: number; y: number; edge: 'left' | 'right' | null; time: number } | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  const createIndicator = useCallback((side: 'left' | 'right') => {
    if (indicatorRef.current) return;
    const el = document.createElement('div');
    el.className = `swipe-nav-indicator swipe-nav-${side}`;
    el.style.cssText = `
      position: fixed;
      top: 50%;
      ${side}: 0;
      transform: translateY(-50%) scale(0.5);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: hsl(var(--primary) / 0.15);
      border: 2px solid hsl(var(--primary) / 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    el.innerHTML = side === 'left'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
    el.style.color = 'hsl(var(--primary))';
    document.body.appendChild(el);
    indicatorRef.current = el;
    requestAnimationFrame(() => {
      el.style.opacity = '0.8';
      el.style.transform = 'translateY(-50%) scale(1)';
    });
  }, []);

  const removeIndicator = useCallback(() => {
    if (indicatorRef.current) {
      indicatorRef.current.style.opacity = '0';
      indicatorRef.current.style.transform = 'translateY(-50%) scale(0.5)';
      const el = indicatorRef.current;
      setTimeout(() => el.remove(), 200);
      indicatorRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const screenW = window.innerWidth;
      let edge: 'left' | 'right' | null = null;

      if (touch.clientX <= edgeWidth && canGoBack) edge = 'left';
      else if (touch.clientX >= screenW - edgeWidth && canGoForward) edge = 'right';

      if (edge) {
        touchStart.current = {
          x: touch.clientX,
          y: touch.clientY,
          edge,
          time: Date.now(),
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;

      // If vertical scroll is dominant, cancel
      if (Math.abs(dy) > Math.abs(dx) * 1.5) {
        removeIndicator();
        touchStart.current = null;
        return;
      }

      const { edge } = touchStart.current;
      const progress = Math.abs(dx) / threshold;

      if (edge === 'left' && dx > 20) {
        createIndicator('left');
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = `translateY(-50%) scale(${Math.min(1 + progress * 0.3, 1.3)})`;
          indicatorRef.current.style.opacity = `${Math.min(progress, 1)}`;
          indicatorRef.current.style.left = `${Math.min(dx - 16, 16)}px`;
        }
      } else if (edge === 'right' && dx < -20) {
        createIndicator('right');
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = `translateY(-50%) scale(${Math.min(1 + progress * 0.3, 1.3)})`;
          indicatorRef.current.style.opacity = `${Math.min(progress, 1)}`;
          indicatorRef.current.style.right = `${Math.min(Math.abs(dx) - 16, 16)}px`;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      removeIndicator();
      if (!touchStart.current) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const elapsed = Date.now() - touchStart.current.time;
      const { edge } = touchStart.current;

      touchStart.current = null;

      // Fast flick (< 300ms) or exceeded threshold
      const isFlick = elapsed < 300 && Math.abs(dx) > 30;
      const isSwipe = Math.abs(dx) >= threshold;

      if (edge === 'left' && dx > 0 && (isFlick || isSwipe)) {
        onSwipeBack?.();
      } else if (edge === 'right' && dx < 0 && (isFlick || isSwipe)) {
        onSwipeForward?.();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      removeIndicator();
    };
  }, [enabled, canGoBack, canGoForward, onSwipeBack, onSwipeForward, threshold, edgeWidth, createIndicator, removeIndicator]);
}
