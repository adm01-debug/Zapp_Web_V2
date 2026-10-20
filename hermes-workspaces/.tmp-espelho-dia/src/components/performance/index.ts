// Performance utilities barrel export
export { LazyView, LazyLoadFallback, withLazyLoading } from './LazyRoutes';
export * from './LazyRoutes';
export { OptimizedImage, OptimizedAvatar } from './OptimizedImage';
export { 
  usePrefetchRoute, 
  usePrefetchData, 
  PrefetchLink, 
  useIntersectionPrefetch,
  useNetworkAwarePrefetch,
  CriticalRoutePrefetcher,
  ResourceHints,
  usePreloadImages
} from './Prefetcher';
export { VirtualizedList, VirtualizedGrid } from './VirtualizedList';
export type { VirtualizedListRef } from './VirtualizedList';
