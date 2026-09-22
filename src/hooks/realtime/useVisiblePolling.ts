import { useCallback, useEffect, useRef } from 'react';

/** Read-only refreshes: one request at a time, only while visible and online. */
export function useVisiblePolling(task: (signal: AbortSignal) => Promise<void>, intervalMs = 30_000, enabled = true) {
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<void> | null = null;
    let controller: AbortController | null = null;

    const refresh = (): Promise<void> => {
      if (stopped || document.visibilityState === 'hidden' || !navigator.onLine) return Promise.resolve();
      if (pending) return pending;
      clearTimeout(timer);
      controller = new AbortController();
      const signal = controller.signal;
      pending = Promise.resolve().then(() => {
        if (!signal.aborted) return task(signal);
      }).catch(() => {
        // Consumers retain their last good snapshot; never log response bodies.
      }).finally(() => {
        pending = null;
        controller = null;
        if (!stopped) timer = setTimeout(() => { void refresh(); }, intervalMs);
      });
      return pending;
    };

    const wake = () => { void refresh(); };
    // A manual refresh after a mutation must not reuse a pre-mutation snapshot.
    // Concurrent callers coalesce into one follow-up request after the pending one.
    refreshRef.current = () => pending ? pending.then(refresh) : refresh();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      refreshRef.current = () => Promise.resolve();
    };
  }, [task, intervalMs, enabled]);

  return useCallback(() => refreshRef.current(), []);
}
