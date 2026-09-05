/**
 * Web Vitals monitoring utility
 * Tracks Core Web Vitals (LCP, FID, CLS, INP, TTFB) and reports to console/analytics
 */

import { getLogger } from '@/lib/logger';

const log = getLogger('WebVitals');

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

const thresholds = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  TTFB: { good: 800, poor: 1800 },
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const t = thresholds[name as keyof typeof thresholds];
  if (!t) return 'good';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

// One slot per metric name — at most 5 entries, no unbounded growth.
const metricsBuffer = new Map<string, WebVitalMetric>();

let _initialized = false;

function onMetric(metric: WebVitalMetric) {
  metricsBuffer.set(metric.name, metric);
  const emoji = metric.rating === 'good' ? '🟢' : metric.rating === 'needs-improvement' ? '🟡' : '🔴';
  // CLS is dimensionless (0–1), not milliseconds.
  const unit = metric.name === 'CLS' ? '' : 'ms';
  log.info(`${emoji} ${metric.name}: ${metric.value.toFixed(metric.name === 'CLS' ? 3 : 0)}${unit} (${metric.rating})`);
}

export function initWebVitals() {
  if (typeof window === 'undefined') return;
  if (_initialized) return;
  _initialized = true;

  // LCP - Largest Contentful Paint
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry;
        if (lastEntry) {
          onMetric({
            name: 'LCP',
            value: lastEntry.startTime,
            rating: getRating('LCP', lastEntry.startTime),
            delta: lastEntry.startTime,
            id: `lcp-${Date.now()}`,
          });
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    }
  } catch (e) { /* not supported */ }

  // FID - First Input Delay
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('first-input')) {
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fid = (entry as PerformanceEventTiming).processingStart - entry.startTime;
          onMetric({
            name: 'FID',
            value: fid,
            rating: getRating('FID', fid),
            delta: fid,
            id: `fid-${Date.now()}`,
          });
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    }
  } catch (e) { /* not supported */ }

  // CLS - Cumulative Layout Shift
  // Accumulate across all batches; emit once on page hide, not per batch.
  let clsValue = 0;
  let clsReported = false;
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
            clsValue += (entry as PerformanceEntry & { value: number }).value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    }
  } catch (e) { /* not supported */ }

  // INP - Interaction to Next Paint
  // Track max across all interactions; emit once on page hide, not per event.
  let inpMax = 0;
  let inpReported = false;
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('event')) {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > inpMax) inpMax = entry.duration;
        }
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
    }
  } catch (e) { /* not supported */ }

  // Flush CLS and INP once when page is unloaded or backgrounded.
  const flushAccumulated = () => {
    if (!clsReported && clsValue > 0) {
      clsReported = true;
      onMetric({ name: 'CLS', value: clsValue, rating: getRating('CLS', clsValue), delta: clsValue, id: `cls-${Date.now()}` });
    }
    if (!inpReported && inpMax > 0) {
      inpReported = true;
      onMetric({ name: 'INP', value: inpMax, rating: getRating('INP', inpMax), delta: inpMax, id: `inp-${Date.now()}` });
    }
  };
  // visibilitychange fires on document per spec; attach directly to avoid relying on bubbling.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAccumulated();
    } else {
      // BFCache restore — reset accumulators so the next hide cycle reports fresh data.
      clsValue = 0;
      clsReported = false;
      inpMax = 0;
      inpReported = false;
    }
  });
  addEventListener('pagehide', flushAccumulated);

  // TTFB - Time to First Byte
  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    // responseStart === 0 means CORS timing restriction — skip to avoid negative TTFB.
    if (navEntry && navEntry.responseStart > 0) {
      const ttfb = navEntry.responseStart - navEntry.requestStart;
      onMetric({
        name: 'TTFB',
        value: ttfb,
        rating: getRating('TTFB', ttfb),
        delta: ttfb,
        id: `ttfb-${Date.now()}`,
      });
    }
  } catch (e) { log.debug('[web-vitals] Navigation Timing API not supported'); }
}

export function getWebVitalsReport(): WebVitalMetric[] {
  return [...metricsBuffer.values()];
}
