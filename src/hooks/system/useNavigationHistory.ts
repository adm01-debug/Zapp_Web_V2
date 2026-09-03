import { useState, useCallback, useMemo, useEffect } from 'react';

export interface NavigationEntry {
  viewId: string;
  timestamp: number;
}

interface NavigationState {
  entries: NavigationEntry[];
  index: number;
  previousView: string | null;
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

// Hashes that are NOT view IDs (e.g. skip-to-content anchors)
export const RESERVED_HASHES = new Set(['main-content', 'main-navigation', 'inbox-section', 'search-input']);

/**
 * Reads the active view from the URL.
 * Canonical format: ?view=<id>
 * Legacy compat: #<id> (hash) — migrated to ?view= on first load.
 */
function getViewFromUrl(defaultView: string): string {
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view');
  if (viewParam) return viewParam;

  // Backward compat: hash-based deep links ("#inbox") before migration
  const hash = window.location.hash.replace('#', '');
  if (hash && !RESERVED_HASHES.has(hash)) return hash;

  return defaultView;
}

/**
 * Navigation history with back/forward stacks, breadcrumb trail,
 * and URL query-param sync (?view=<id>) for deep linking.
 *
 * Canonical URL format: ?view=<viewId>
 * Legacy hash URLs (#<viewId>) are migrated to ?view= on first load.
 *
 * Uses a single state atom for history+index to prevent race conditions
 * between separate setState calls.
 */
export function useNavigationHistory(defaultView = 'inbox'): NavigationHistoryReturn {
  const [state, setState] = useState<NavigationState>(() => ({
    entries: [{ viewId: getViewFromUrl(defaultView), timestamp: Date.now() }],
    index: 0,
    previousView: null,
  }));

  const currentView = state.entries[state.index]?.viewId ?? defaultView;

  // Sync ?view= → state on browser back/forward (popstate fires for pushState/replaceState).
  const onPopState = useCallback(() => {
    const viewId = getViewFromUrl(defaultView);
    setState(prev => {
      const currentViewId = prev.entries[prev.index]?.viewId;
      if (viewId === currentViewId) return prev;

      // Browser went back → find matching entry before current index
      for (let i = prev.index - 1; i >= 0; i--) {
        if (prev.entries[i].viewId === viewId) {
          return { ...prev, index: i, previousView: currentViewId ?? null };
        }
      }
      // Browser went forward → find matching entry after current index
      for (let i = prev.index + 1; i < prev.entries.length; i++) {
        if (prev.entries[i].viewId === viewId) {
          return { ...prev, index: i, previousView: currentViewId ?? null };
        }
      }
      // Address bar / deep link → push new entry
      const newEntry: NavigationEntry = { viewId, timestamp: Date.now() };
      const truncated = prev.entries.slice(0, prev.index + 1);
      const newEntries = [...truncated, newEntry].slice(-MAX_HISTORY);
      return { entries: newEntries, index: newEntries.length - 1, previousView: currentViewId ?? null };
    });
  }, [defaultView]);

  // Migration bridge: legacy code (e.g. GlobalSearch, ContactsCRUD) may still write
  // window.location.hash = '#inbox'. Intercept hashchange, migrate URL to ?view=, and handle.
  const onHashChange = useCallback(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash || RESERVED_HASHES.has(hash)) return;

    // Migrate the URL: replace hash with ?view= query param
    const url = new URL(window.location.href);
    url.searchParams.set('view', hash);
    url.hash = '';
    window.history.replaceState(null, '', url.href);

    // Handle as a view change using the same logic as onPopState
    onPopState();
  }, [onPopState]);

  useEffect(() => {
    // One-time migration: if URL still uses hash (#inbox) with no ?view=, rewrite to ?view=inbox
    const hash = window.location.hash.replace('#', '');
    const params = new URLSearchParams(window.location.search);
    if (hash && !RESERVED_HASHES.has(hash) && !params.get('view')) {
      const url = new URL(window.location.href);
      url.searchParams.set('view', hash);
      url.hash = '';
      window.history.replaceState(null, '', url.href);
    }

    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [onPopState, onHashChange]);

  const syncView = useCallback((viewId: string, replace = false) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', viewId);
    // Clear any lingering hash that is not a skip-to-content anchor
    if (url.hash && !RESERVED_HASHES.has(url.hash.replace('#', ''))) {
      url.hash = '';
    }
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

      // Truncate forward history
      const truncated = prev.entries.slice(0, prev.index + 1);
      const newEntry: NavigationEntry = { viewId, timestamp: Date.now() };
      const newEntries = [...truncated, newEntry].slice(-MAX_HISTORY);
      const newIndex = newEntries.length - 1;

      syncView(viewId);

      return { entries: newEntries, index: newIndex, previousView: currentViewId ?? null };
    });
  }, [syncView]);

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.index <= 0) return prev;
      const newIndex = prev.index - 1;
      const targetView = prev.entries[newIndex]?.viewId;
      if (targetView) syncView(targetView, true);
      return { ...prev, index: newIndex, previousView: prev.entries[prev.index]?.viewId ?? null };
    });
  }, [syncView]);

  const goForward = useCallback(() => {
    setState(prev => {
      if (prev.index >= prev.entries.length - 1) return prev;
      const newIndex = prev.index + 1;
      const targetView = prev.entries[newIndex]?.viewId;
      if (targetView) syncView(targetView, true);
      return { ...prev, index: newIndex, previousView: prev.entries[prev.index]?.viewId ?? null };
    });
  }, [syncView]);

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
    previousView: state.previousView,
    history: state.entries,
  };
}
