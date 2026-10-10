import { useEffect, useRef, useCallback } from 'react';

/**
 * Announces route/view changes to screen readers via an aria-live region.
 * Usage: call `announce(message)` after navigation.
 * 
 * The component renders a visually hidden <div> with role="status"
 * that screen readers will pick up automatically.
 */
export function useAriaAnnouncer() {
  const regionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create the live region once
    if (!regionRef.current) {
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.className = 'sr-only';
      el.id = 'aria-route-announcer';
      document.body.appendChild(el);
      regionRef.current = el;
    }

    return () => {
      if (regionRef.current && document.body.contains(regionRef.current)) {
        document.body.removeChild(regionRef.current);
        regionRef.current = null;
      }
    };
  }, []);

  const announce = useCallback((message: string) => {
    if (regionRef.current) {
      // Clear then set to trigger re-announcement
      regionRef.current.textContent = '';
      requestAnimationFrame(() => {
        if (regionRef.current) {
          regionRef.current.textContent = message;
        }
      });
    }
  }, []);

  return { announce };
}
