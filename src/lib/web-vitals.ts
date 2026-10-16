/**
 * Web Vitals monitoring utility
 * Tracks Core Web Vitals (LCP, FID, CLS, INP, TTFB) and reports to console/analytics
 *
 * Os alvos vêm de `performance-budget.json` → seção `web-vitals` (E36). Antes
 * havia aqui uma cópia dos limiares, que divergia do arquivo sem ninguém notar:
 * o JSON não era lido por nenhum código. Fonte única agora.
 */

import { getLogger } from '@/lib/logger';
import performanceBudget from '../../performance-budget.json';

const log = getLogger('WebVitals');

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

type VitalName = 'LCP' | 'FID' | 'CLS' | 'INP' | 'TTFB';

interface VitalTarget {
  /** Limite de "good" — acima disso a métrica pede atenção. */
  target: number;
  /** Limite de "poor" — acima disso é falha. */
  poor: number;
  unit: string;
}

/** Alvos de `performance-budget.json` (seção `web-vitals`). */
const targets = performanceBudget['web-vitals'] as unknown as Record<VitalName, VitalTarget>;

/** Classifica a métrica contra os alvos do budget. Exportado para teste. */
export function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const t = targets[name as VitalName];
  if (!t) return 'good';
  if (value <= t.target) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

/** Alvos para consulta externa (relatórios/testes). */
export function getVitalTargets(): Record<VitalName, VitalTarget> {
  return targets;
}

// One slot per metric name — at most 5 entries, no unbounded growth.
const metricsBuffer = new Map<string, WebVitalMetric>();

let _initialized = false;

function onMetric(metric: WebVitalMetric) {
  metricsBuffer.set(metric.name, metric);
  const emoji = metric.rating === 'good' ? '🟢' : metric.rating === 'needs-improvement' ? '🟡' : '🔴';
  // CLS is dimensionless (0–1), not milliseconds.
  const unit = metric.name === 'CLS' ? '' : 'ms';
  const alvo = targets[metric.name as VitalName];
  const contraAlvo = alvo ? ` (alvo ${alvo.target}${alvo.unit === 'score' ? '' : alvo.unit})` : '';
  log.info(
    `${emoji} ${metric.name}: ${metric.value.toFixed(metric.name === 'CLS' ? 3 : 0)}${unit}${contraAlvo} — ${metric.rating}`,
  );
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
  // Definição (web.dev/articles/cls): CLS é a MAIOR janela de sessão de shifts —
  // shifts a menos de 1 s entre si e a menos de 5 s desde o primeiro da janela.
  // Somar a sessão visível inteira inflava o valor quando os bursts eram
  // separados por mais de 1 s (dois shifts de 0,06 a 2 s davam 0,12 em vez de 0,06).
  let clsValue = 0;          // maior janela de sessão encerrada até agora
  let clsReported = false;
  let clsSessionValue = 0;   // janela de sessão em andamento
  let clsSessionFirst = 0;
  let clsSessionLast = 0;
  const resetCls = () => {
    clsValue = 0;
    clsReported = false;
    clsSessionValue = 0;
    clsSessionFirst = 0;
    clsSessionLast = 0;
  };
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
          if (shift.hadRecentInput) continue;
          const insideSession =
            clsSessionValue > 0 &&
            shift.startTime - clsSessionLast < 1000 &&
            shift.startTime - clsSessionFirst < 5000;
          if (insideSession) {
            clsSessionValue += shift.value;
          } else {
            clsSessionValue = shift.value;
            clsSessionFirst = shift.startTime;
          }
          clsSessionLast = shift.startTime;
          if (clsSessionValue > clsValue) clsValue = clsSessionValue;
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    }
  } catch (e) { /* not supported */ }

  // INP - Interaction to Next Paint
  // Definição (web.dev/articles/inp): INP é o p98 das interações — uma interação
  // por `interactionId` e, a cada 50 interações, a mais longa é descartada.
  // O maior `duration` bruto superestimava a responsividade (50 interações com
  // um pico de 1000 ms e a segunda de 160 ms davam 1000 em vez de 160).
  const inpDurations = new Map<string, number>();
  let inpReported = false;
  const resetInp = () => {
    inpDurations.clear();
    inpReported = false;
  };
  /** INP: descarta as `floor(n / 50)` interações mais longas e devolve a maior restante. */
  const getInpValue = (): number => {
    const durations = [...inpDurations.values()].sort((a, b) => b - a);
    if (durations.length === 0) return 0;
    return durations[Math.floor(durations.length / 50)] ?? 0;
  };
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('event')) {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const interaction = entry as PerformanceEntry & { interactionId?: number };
          // Eventos sem interactionId (ausente ou 0, como pointermove) não são interação.
          if (!interaction.interactionId) continue;
          // Cada interação conta uma vez; repetições do mesmo id ficam com a maior.
          const key = `id:${interaction.interactionId}`;
          const previous = inpDurations.get(key);
          if (previous === undefined || entry.duration > previous) {
            inpDurations.set(key, entry.duration);
          }
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
    if (!inpReported) {
      const inpValue = getInpValue();
      if (inpValue > 0) {
        inpReported = true;
        onMetric({ name: 'INP', value: inpValue, rating: getRating('INP', inpValue), delta: inpValue, id: `inp-${Date.now()}` });
      }
    }
  };
  // visibilitychange fires on document per spec; attach directly to avoid relying on bubbling.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAccumulated();
    } else {
      // BFCache restore — reset accumulators so the next hide cycle reports fresh data.
      resetCls();
      resetInp();
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
