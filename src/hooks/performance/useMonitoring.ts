import { useState, useEffect, useRef } from 'react';
import { log } from '@/lib/logger';
import { useAnimationFrame } from './useTimingHooks';

/**
 * Measure component render performance
 */
export function useRenderCount(componentName: string): number {
  const renderCount = useRef(0);
  
  useEffect(() => {
    renderCount.current += 1;
    if (process.env.NODE_ENV === 'development') {
      log.debug(`${componentName} rendered ${renderCount.current} times`);
    }
  });

  return renderCount.current;
}

/**
 * Track memory usage (development only)
 */
export function useMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
  const [memory, setMemory] = useState<{ usedJSHeapSize: number; totalJSHeapSize: number } | null>(null);

  useEffect(() => {
    if (import.meta.env.PROD) return;
    
    interface PerformanceMemory {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    }
    
    interface PerformanceWithMemory extends Performance {
      memory?: PerformanceMemory;
    }
    
    const checkMemory = () => {
      const perf = performance as PerformanceWithMemory;
      if (perf.memory) {
        setMemory({
          usedJSHeapSize: perf.memory.usedJSHeapSize,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
        });
      }
    };

    checkMemory();
    const interval = setInterval(checkMemory, 5000);

    return () => clearInterval(interval);
  }, []);

  return memory;
}

/**
 * Track FPS
 */
export function useFPS(): number {
  const [fps, setFps] = useState(60);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useAnimationFrame(() => {
    frameCount.current++;
    const now = performance.now();
    const delta = now - lastTime.current;

    if (delta >= 1000) {
      setFps(Math.round((frameCount.current * 1000) / delta));
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return fps;
}

/**
 * Detect slow renders
 */
export function usePerformanceMonitor(
  componentName: string,
  threshold = 16
) {
  const startTime = useRef<number>();

  useEffect(() => {
    startTime.current = performance.now();
  });

  useEffect(() => {
    if (startTime.current && process.env.NODE_ENV === 'development') {
      const renderTime = performance.now() - startTime.current;
      if (renderTime > threshold) {
        log.warn(
          `⚠️ Slow render in ${componentName}: ${renderTime.toFixed(2)}ms (threshold: ${threshold}ms)`
        );
      }
    }
  });
}
