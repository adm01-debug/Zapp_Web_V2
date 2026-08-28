import { useState, useEffect, useCallback } from 'react';

/**
 * Syncs the currentView state with the URL hash for deep-linkable navigation.
 * e.g., /#inbox, /#dashboard, /#contacts
 */
export function useDeepLinks(defaultView = 'inbox') {
  const getViewFromHash = useCallback(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || defaultView;
  }, [defaultView]);

  const [currentView, setCurrentView] = useState(getViewFromHash);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const view = getViewFromHash();
      setCurrentView(view);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [getViewFromHash]);

  // Update hash when view changes
  const navigateTo = useCallback((view: string) => {
    setCurrentView(view);
    window.history.pushState(null, '', `#${view}`);
  }, []);

  return { currentView, setCurrentView: navigateTo };
}
