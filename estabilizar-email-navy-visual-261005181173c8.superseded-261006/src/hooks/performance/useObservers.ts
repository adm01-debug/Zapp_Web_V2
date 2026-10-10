import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Intersection observer hook for lazy loading
 */
export function useIntersection(
  ref: React.RefObject<Element>,
  options?: IntersectionObserverInit
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [ref, options]);

  return isIntersecting;
}

/**
 * Lazy load component when visible
 */
export function useLazyLoad(
  ref: React.RefObject<Element>,
  threshold = 0.1
): { isVisible: boolean; hasLoaded: boolean } {
  const [hasLoaded, setHasLoaded] = useState(false);
  const isVisible = useIntersection(ref, { threshold });

  useEffect(() => {
    if (isVisible && !hasLoaded) {
      setHasLoaded(true);
    }
  }, [isVisible, hasLoaded]);

  return { isVisible, hasLoaded };
}

/**
 * Optimized event listener with passive support
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions
) {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const eventListener = (event: WindowEventMap[K]) => savedHandler.current(event);
    
    window.addEventListener(eventName, eventListener, { passive: true, ...options });
    
    return () => {
      window.removeEventListener(eventName, eventListener);
    };
  }, [eventName, options]);
}
