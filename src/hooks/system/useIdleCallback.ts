import { useEffect, useRef, useCallback } from 'react';

/**
 * Schedule work during browser idle periods.
 * Falls back to setTimeout for browsers without requestIdleCallback.
 *
 * @param callback - Work to perform during idle time
 * @param options - timeout: max wait before forcing execution (default: 2000ms)
 */
export function useIdleCallback(
  callback: () => void,
  options: { timeout?: number; enabled?: boolean } = {}
): void {
  const { timeout = 2000, enabled = true } = options;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const schedule = window.requestIdleCallback ?? 
      ((cb: IdleRequestCallback) => window.setTimeout(() => cb({
        didTimeout: false,
        timeRemaining: () => 50,
      } as IdleDeadline), 100));

    const cancel = window.cancelIdleCallback ?? window.clearTimeout;

    const id = schedule(() => {
      callbackRef.current();
    }, { timeout });

    return () => cancel(id);
  }, [enabled, timeout]);
}

/**
 * Returns a function that schedules work during idle periods.
 * Useful for non-critical analytics, prefetching, etc.
 */
export function useIdleScheduler() {
  const pendingRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      const cancel = window.cancelIdleCallback ?? window.clearTimeout;
      pendingRef.current.forEach((id) => cancel(id));
      pendingRef.current = [];
    };
  }, []);

  const scheduleIdle = useCallback((work: () => void, timeout = 5000) => {
    const schedule = window.requestIdleCallback ??
      ((cb: IdleRequestCallback) => window.setTimeout(() => cb({
        didTimeout: false,
        timeRemaining: () => 50,
      } as IdleDeadline), 100));

    const id = schedule(() => work(), { timeout });
    pendingRef.current.push(id);
    return id;
  }, []);

  return scheduleIdle;
}
