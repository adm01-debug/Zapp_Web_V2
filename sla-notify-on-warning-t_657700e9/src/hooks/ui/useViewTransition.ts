import { useCallback } from 'react';

/**
 * Hook that wraps navigation actions in the View Transitions API
 * when supported, with graceful fallback for unsupported browsers.
 * Catches and silences TimeoutError / InvalidStateError from aborted transitions.
 */
export function useViewTransition() {
  const startTransition = useCallback((callback: () => void) => {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> };
    };

    if (doc.startViewTransition) {
      const transition = doc.startViewTransition(callback);
      // Silently swallow aborted transitions — these are harmless and happen when
      // a new transition starts before the previous one finishes (rapid navigation).
      transition.finished.catch(() => {});
      transition.ready.catch(() => {});
      transition.updateCallbackDone.catch(() => {});
    } else {
      callback();
    }
  }, []);

  return { startTransition };
}
