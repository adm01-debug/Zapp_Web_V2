import { useState, useEffect, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

const STORAGE_KEY = 'zapp-sidebar-collapsed';

export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      safeSetItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Listen for toggle-sidebar custom event (keyboard shortcut)
  useEffect(() => {
    const handler = () => toggle();
    document.addEventListener('toggle-sidebar', handler);
    return () => document.removeEventListener('toggle-sidebar', handler);
  }, [toggle]);

  return { collapsed, toggle };
}
