// Performance hooks — barrel re-export
export { useDebounce, useThrottle, useAnimationFrame, useStableCallback, useIdleCallback } from '../performance/useTimingHooks';
export { useIntersection, useLazyLoad, useEventListener } from '../performance/useObservers';
export { useRenderCount, useMemoryUsage, useFPS, usePerformanceMonitor } from '../performance/useMonitoring';
export { useOptimizedList, usePreloadResources } from '../performance/useDataOptimization';
