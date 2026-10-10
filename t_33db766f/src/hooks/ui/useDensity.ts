import { useState, useEffect, useCallback } from 'react';

export type DensityMode = 'comfortable' | 'compact' | 'dense';

const STORAGE_KEY = 'ui-density';

export function useDensity() {
  const [density, setDensityState] = useState<DensityMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as DensityMode) || 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    try {
      localStorage.setItem(STORAGE_KEY, density);
    } catch { /* storage unavailable */ }
  }, [density]);

  const setDensity = useCallback((mode: DensityMode) => {
    setDensityState(mode);
  }, []);

  const cycleDensity = useCallback(() => {
    setDensityState(prev => {
      const order: DensityMode[] = ['comfortable', 'compact', 'dense'];
      const idx = order.indexOf(prev);
      return order[(idx + 1) % order.length];
    });
  }, []);

  return { density, setDensity, cycleDensity };
}
