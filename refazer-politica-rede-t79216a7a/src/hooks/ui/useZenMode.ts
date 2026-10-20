import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'zen-mode';

export function useZenMode() {
  const [isZen, setIsZen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleZen = useCallback(() => {
    setIsZen((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const exitZen = useCallback(() => {
    setIsZen(false);
    try { localStorage.setItem(STORAGE_KEY, 'false'); } catch { /* storage unavailable */ }
  }, []);

  // Escape key exits zen mode
  useEffect(() => {
    if (!isZen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitZen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isZen, exitZen]);

  return { isZen, toggleZen, exitZen };
}