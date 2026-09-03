import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

export interface NavigationEntry {
  viewId: string;
  timestamp: number;
}

interface NavigationState {
  entries: NavigationEntry[];
  index: number;
}

interface NavigationHistoryReturn {
  currentView: string;
  navigateTo: (viewId: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Breadcrumb trail (last N entries, deduplicated consecutive) */
  breadcrumbTrail: string[];
  /** Previous view id (for transition direction) */
  previousView: string | null;
  /** Full history stack */
  history: NavigationEntry[];
}

const MAX_HISTORY = 50;
const BREADCRUMB_DEPTH = 4;

/**
 * Navigation history with back/forward stacks, breadcrumb trail,
 * and URL hash sync for deep linking.
 *
 * Uses a single state atom for history+index to prevent race conditions
 * between separate setState calls.
 */
// Hashes that are NOT view IDs (e.g. skip-to-content anchors)
const RESERVED_HASHES = new Set(['main-content', 'main-navigation', 'inbox-section', 'search-input']);

export function useNavigationHistory(defaultView = 'inbox'): NavigationHistoryReturn {
  const getInitialView = () => {
    const hash = window.location.hash.replace('#', '');
    return (hash && !RESERVED_HASHES.has(hash)) ? hash : defaultView;
  };

  const [state, setState] = useState<NavigationState>(() => ({
    entries: [{ viewId: getInitialView(), timestamp: Date.now() }],
    index: 0,
  }));

  const previousViewRef = useRef<string | null>(null);
  const isInternalNav = useRef(false);

  const currentView = state.entries[state.index]?.viewId ?? defaultView;

  // Sync hash → state on browser back/forward
  // Uses setState callback to avoid stale closure and properly detect back vs forward
  const onHashChange = useCallback(() => {
    if (isInternalNav.current) {
      isInternalNav.current = false;
      return;
    }
    const hash = window.location.hash.replace('#', '');
    if (!hash || RESERVED_HASHES.has(hash)) return;

    setState(prev => {
      const currentViewId = prev.entries[prev.index]?.viewId;
      if (hash === currentViewId) return prev;

      // Browser went back → find matching entry before current index
      for (let i = prev.index - 1; i >= 0; i--) {
        if (prev.entries[i].viewId === hash) {
          previousViewRef.current = currentViewId ?? null;
          return { ...prev, index: i };
        }
      }
      // Browser went forward → find matching entry after current index
      for (let i = prev.index + 1; i < prev.entries.length; i++) {
        if (prev.entries[i].viewId === hash) {
          previousViewRef.current = currentViewId ?? null;
          return { ...prev, index: i };
        }
      }
      // Address bar / deep link → push new entry
      previousViewRef.current = currentViewId ?? null;
      const newEntry: NavigationEntry = { viewId: hash, timestamp: Date.now() };
      const truncated = prev.entries.slice(0, prev.index + 1);
      const newEntries = [...truncated, newEntry].slice(-MAX_HISTORY);
      return { entries: newEntries, index: newEntries.length - 1 };
    });
  }, []);

  useEffect(() => {
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [onHashChange]);

  const syncHash = useCallback((viewId: string, replace = false) => {
    isInternalNav.current = true;
    const url = new URL(window.location.href);
    url.hash = viewId;
    if (replace) {
      window.history.replaceState(null, '', url.href);
    } else {
      window.history.pushState(null, '', url.href);
    }
  }, []);

  const navigateTo = useCallback((viewId: string) => {
    setState(prev => {
      const currentViewId = prev.entries[prev.index]?.viewId;
      if (viewId === currentViewId) return prev;

      previousViewRef.current = currentViewId ?? null;

      // Truncate forward history
      const truncated = prev.entries.slice(0, prev.index + 1);
      const newEntry: NavigationEntry = { viewId, timestamp: Date.now() };
      const newEntries = [...truncated, newEntry].slice(-MAX_HISTORY);
      const newIndex = newEntries.length - 1;

      syncHash(viewId);

      return { entries: newEntries, index: newIndex };
    });
  }, [syncHash]);

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.index <= 0) return prev;
      previousViewRef.current = prev.entries[prev.index]?.viewId ?? null;
      const newIndex = prev.index - 1;
      const targetView = prev.entries[newIndex]?.viewId;
      if (targetView) syncHash(targetView, true); // Use replace when going back through internal stack
      return { ...prev, index: newIndex };
    });
  }, [syncHash]);

  const goForward = useCallback(() => {
    setState(prev => {
      if (prev.index >= prev.entries.length - 1) return prev;
      previousViewRef.current = prev.entries[prev.index]?.viewId ?? null;
      const newIndex = prev.index + 1;
      const targetView = prev.entries[newIndex]?.viewId;
      if (targetView) syncHash(targetView, true); // Use replace when going forward through internal stack
      return { ...prev, index: newIndex };
    });
  }, [syncHash]);

  const canGoBack = state.index > 0;
  const canGoForward = state.index < state.entries.length - 1;

  const breadcrumbTrail = useMemo(() => {
    const trail: string[] = [];
    for (let i = state.index; i >= 0 && trail.length < BREADCRUMB_DEPTH; i--) {
      const entry = state.entries[i];
      if (!entry) break;
      const viewId = entry.viewId;
      if (trail.length === 0 || trail[trail.length - 1] !== viewId) {
        trail.push(viewId);
      }
    }
    return trail.reverse();
  }, [state.entries, state.index]);

  return {
    currentView,
    navigateTo,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    breadcrumbTrail,
    previousView: previousViewRef.current,
    history: state.entries,
  };
}
