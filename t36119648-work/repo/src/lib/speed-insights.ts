/**
 * Envio dos Web Vitals ao Speed Insights da Vercel — E36.
 *
 * Módulo separado de propósito: fica FORA do bundle inicial (é importado
 * dinamicamente pelo `main.tsx`). Manter isto inline em `web-vitals.ts` custava
 * +0,8 KB no entry, e a folga do orçamento era de apenas 3,2 KB.
 *
 * Por que existe: o Speed Insights estava habilitado no painel mas **sem nada
 * instrumentando** — `vercel metrics vercel.speed_insights.*` respondeu zero
 * datapoints em 90 dias, em todos os projetos do time.
 */

import { getLogger } from '@/lib/logger';

const log = getLogger('SpeedInsights');

let _initialized = false;

/**
 * Injeta o coletor do Speed Insights em tempo ocioso. Chamado a partir de um
 * import dinâmico; falha em silêncio (é telemetria, não requisito da tela).
 */
export function initSpeedInsights() {
  if (typeof window === 'undefined') return;
  if (_initialized) return;
  _initialized = true;

  const idle =
    window.requestIdleCallback?.bind(window) ??
    ((cb: IdleRequestCallback) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline), 1));

  idle(() => {
    void import('@vercel/speed-insights')
      .then((m) => m.injectSpeedInsights())
      .catch((err) => log.debug('[speed-insights] indisponível', err));
  });
}
