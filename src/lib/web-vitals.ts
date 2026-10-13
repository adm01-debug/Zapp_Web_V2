/**
 * Web Vitals monitoring utility
 * Mede as métricas do orçamento — LCP, FCP, CLS, INP, TTFB, FID — mais o TTI
 * local (SL-105) — e as reporta no console/analytics.
 *
 * O `FID` continua sendo coletado aqui por `first-input` (mais abaixo) e por isso
 * segue no mapa mesmo com a métrica aposentada: no `performance-budget.json` ele
 * está declarado `"field": false`, porque o Speed Insights não publica FID — não
 * tem par de campo, e o alvo só vale enquanto esta coleta existir.
 *
 * Os alvos vêm de `performance-budget.json` → seção `web-vitals` (E36). Antes
 * havia aqui uma cópia dos limiares, que divergia do arquivo sem ninguém notar:
 * o JSON não era lido por nenhum código. Fonte única agora.
 *
 * Além do console, o que foi medido sobe de forma AMOSTRADA para
 * `web_vitals_samples` (PE-108/SL-231) — o outro lado do arquivo está na seção
 * "Envio amostrado dos Web Vitals ao servidor", no fim.
 */

import { getLogger } from '@/lib/logger';
import performanceBudget from '../../performance-budget.json';

// Global injetado pelo `define` do Vite; ausente em jsdom/vitest — o `typeof`
// guard evita ReferenceError (mesmo padrão de src/lib/errorReporter.ts).
declare const __ZAPP_BUILD_ID__: string | undefined;

const log = getLogger('WebVitals');

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

type VitalName = 'LCP' | 'FID' | 'CLS' | 'INP' | 'TTFB' | 'FCP' | 'TTI';

/**
 * Métricas que este coletor mede. O teste de contrato
 * (`src/lib/__tests__/web-vitals-fcp-tti.test.ts`) exige que seja EXATAMENTE o
 * conjunto das chaves de `performance-budget.json` → `web-vitals`: alvo
 * declarado sem medição (ou o contrário) quebra a suíte.
 */
export const COLLECTED_VITALS: readonly VitalName[] = ['LCP', 'FID', 'CLS', 'INP', 'TTFB', 'FCP', 'TTI'];

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

  // PE-108/SL-231: sorteia a amostragem deste documento e já começa a ler o
  // interruptor. Ler ANTES do unload é o que permite o lote sair no `pagehide`.
  _vitalsSampled = deveAmostrar();
  void loadVitalsSwitch();

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

  // TTI - Time to Interactive (SL-105)
  // Algoritmo do Lighthouse, na parte que o navegador permite medir daqui: TTI é
  // o fim da última long task (>= 50 ms) que precede uma janela de 5 s sem long
  // tasks, contada a partir do FCP — um TTI nunca é anterior ao FCP. Sem long
  // task depois do FCP, o TTI vale o FCP (a página ficou interativa no FCP).
  // O que NÃO é reproduzido: a janela de rede do Lighthouse (no máximo 2
  // requisições em voo), porque o PerformanceObserver entrega as entradas de
  // `resource` só depois de a requisição terminar.
  const TTI_QUIET_MS = 5000;
  let fcpTime = 0;          // ms desde a navegação; 0 = FCP ainda não observado
  let lastLongTaskEnd = 0;  // fim da long task mais recente
  let ttiReported = false;
  let ttiTimer: ReturnType<typeof setTimeout> | null = null;
  /** (Re)arma o relógio da janela de silêncio — reinicia a cada long task nova. */
  const scheduleTtiCheck = () => {
    if (fcpTime <= 0) return; // TTI é definido depois do FCP
    if (ttiTimer !== null) clearTimeout(ttiTimer);
    ttiTimer = setTimeout(reportTti, TTI_QUIET_MS);
  };
  function reportTti() {
    if (ttiReported || fcpTime <= 0) return;
    ttiReported = true;
    const value = Math.max(fcpTime, lastLongTaskEnd);
    onMetric({ name: 'TTI', value, rating: getRating('TTI', value), delta: value, id: `tti-${Date.now()}` });
  }

  // Flush CLS, INP e TTI once when page is unloaded or backgrounded.
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
    // Se a janela de 5 s não chegou a completar (saída/aba oculta antes), vale o
    // que se sabe até aqui — o mesmo critério que o Lighthouse usa no fim do trace.
    reportTti();
    // PE-108/SL-231: o mesmo unload que fecha o relatório é o que leva o lote.
    flushVitalsToServer();
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

  // FCP - First Contentful Paint (SL-105)
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('paint')) {
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // A entrada 'paint' entrega first-paint e first-contentful-paint.
          if (entry.name !== 'first-contentful-paint') continue;
          fcpTime = entry.startTime;
          onMetric({
            name: 'FCP',
            value: fcpTime,
            rating: getRating('FCP', fcpTime),
            delta: fcpTime,
            id: `fcp-${Date.now()}`,
          });
          scheduleTtiCheck();
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    }
  } catch (e) { /* not supported */ }

  // Long tasks — insumo do TTI (SL-105). Sem suporte (Safari/Firefox), o TTI
  // degenera para o FCP, que é o limite inferior correto.
  try {
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const end = entry.startTime + entry.duration;
          if (end > lastLongTaskEnd) lastLongTaskEnd = end;
        }
        // Cada long task nova reabre a contagem: a janela de 5 s começa no fim dela.
        scheduleTtiCheck();
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    }
  } catch (e) { /* not supported */ }

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

// ---------------------------------------------------------------------------
// Envio amostrado dos Web Vitals ao servidor (PE-108 / SL-231)
//
// O que sobe: a métrica, o valor, a ROTA normalizada (pathname sem query string,
// sem fragmento e com identificador de linha virando `:id`) e a versão do app.
// NÃO sobe URL completa, user-agent, IP nem identificador de sessão.
//
// Como sobe: só ~10% dos documentos amostram; o lote sai UMA vez por documento,
// no `pagehide`/`visibilitychange`, pela RPC `record_web_vital` — o cliente não
// tem INSERT em `web_vitals_samples`. Toda falha é silenciosa: telemetria não
// pode virar erro de tela.
//
// Interruptor (chave ausente ou ilegível = DESLIGADO, decisão fail-closed):
//  - `feature_flags.web_vitals_samples` — visível a todo `authenticated`;
//  - `global_settings.web_vitals_samples` — como pede o cartão; a leitura dessa
//    tabela é restrita a admin/supervisor por RLS, então sozinha ela só ligaria
//    a coleta na sessão de quem é admin.
// Ligado em QUALQUER uma das duas fontes, a coleta acontece.
// ---------------------------------------------------------------------------

/** Nome do interruptor, usado nas duas fontes. */
export const WEB_VITALS_SWITCH_KEY = 'web_vitals_samples';

/** Fatia dos documentos que envia (10%). */
export const WEB_VITALS_SAMPLE_RATE = 0.1;

/** Teto de amostras por lote: acima disso a RPC recusa o LOTE INTEIRO. */
export const WEB_VITALS_MAX_BATCH = 50;

/** Uma amostra no formato que `record_web_vital` aceita. */
export interface WebVitalSample {
  metric: VitalName;
  value: number;
  route: string;
  app_version: string;
}

/** Mesmo teto do CHECK de `web_vitals_samples.route`. */
const ROUTE_MAX_LEN = 200;

/**
 * Segmento de rota que é identificador: número puro ou hex longo (uuid colado).
 * Exige pelo menos um dígito, senão um caminho legítimo formado só por letras
 * 'a'-'f' (`/faced`, `/deadbeef`) viraria `:id`.
 */
const ID_SEGMENT = /^(?:\d+|[0-9a-fA-F]{8,}(?:-[0-9a-fA-F]{4,})*)$/;
const TEM_DIGITO = /\d/;

/**
 * Rota normalizada: corta query string e fragmento, garante o `/` inicial, troca
 * identificador de linha por `:id` e respeita o teto de 200 caracteres do CHECK
 * da tabela. Pathname inesperado vira `/` — nunca sobe URL completa.
 */
export function normalizeVitalRoute(pathname: string | null | undefined): string {
  const semParametros = String(pathname ?? '').replace(/[?#].*$/, '');
  if (!semParametros.startsWith('/')) return '/';
  const normalizada = semParametros
    .split('/')
    .map((segmento) => (ID_SEGMENT.test(segmento) && TEM_DIGITO.test(segmento) ? ':id' : segmento))
    .join('/')
    .replace(/\/{2,}/g, '/')
    .slice(0, ROUTE_MAX_LEN);
  return normalizada.startsWith('/') ? normalizada : '/';
}

/** Interpreta o valor do interruptor em `global_settings` ('on'/'true'/'1'/'yes'). */
export function switchEnabled(value: string | null | undefined): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'on' || v === 'true' || v === '1' || v === 'yes';
}

/**
 * Sorteio por documento: `true` para ~`rate` das sessões. `rate >= 1` liga tudo e
 * `rate <= 0` desliga tudo, sem depender do sorteio. `rand` é injetado para o
 * teste não depender de sorte.
 */
export function deveAmostrar(
  rate: number = WEB_VITALS_SAMPLE_RATE,
  rand: () => number = Math.random,
): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (rate >= 1) return true;
  return rand() < rate;
}

/** Arredonda o que sobe: CLS em 3 casas; as demais métricas (ms) em inteiro. */
function arredondarVital(name: VitalName, value: number): number {
  return name === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value);
}

/** Mesma faixa dos CHECKs de `web_vitals_samples` (CLS 0..10; demais 0..600000). */
function vitalNaFaixa(name: VitalName, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  return value <= (name === 'CLS' ? 10 : 600000);
}

/** Versão do app da amostra (`__ZAPP_BUILD_ID__` vem do define do Vite). */
function versaoDoApp(): string {
  const build = typeof __ZAPP_BUILD_ID__ === 'string' ? __ZAPP_BUILD_ID__ : '';
  const limpa = build.replace(/\s+/g, '').slice(0, 40);
  return limpa || 'unknown';
}

/**
 * Monta o lote: só métrica que este coletor mede e valor dentro da faixa da RPC.
 * A validação é no cliente porque a RPC recusa o LOTE INTEIRO (22023) quando uma
 * amostra está fora de faixa.
 */
export function buildVitalSamples(
  report: readonly WebVitalMetric[],
  route: string,
  appVersion: string,
): WebVitalSample[] {
  const samples: WebVitalSample[] = [];
  for (const metrica of report) {
    if (!COLLECTED_VITALS.includes(metrica.name as VitalName)) continue;
    const name = metrica.name as VitalName;
    if (!vitalNaFaixa(name, metrica.value)) continue;
    samples.push({ metric: name, value: arredondarVital(name, metrica.value), route, app_version: appVersion });
    if (samples.length >= WEB_VITALS_MAX_BATCH) break;
  }
  return samples;
}

/**
 * Envia um lote pela RPC. Devolve `false` quando nada foi enviado (lote vazio,
 * rede ou sessão indisponível). Nunca lança — quem chama está no unload.
 */
export async function sendVitalSamples(
  samples: readonly WebVitalSample[],
  send?: (lote: WebVitalSample[]) => Promise<unknown>,
): Promise<boolean> {
  if (samples.length === 0) return false;
  try {
    const enviar =
      send ??
      (async (lote: WebVitalSample[]) => {
        const { supabase } = await import('@/integrations/supabase/client');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova (PE-108), types.ts ainda não sincronizado
        const { error } = await (supabase as any).rpc('record_web_vital', { p_samples: lote });
        if (error) throw error;
      });
    await enviar([...samples]);
    return true;
  } catch (err) {
    log.debug('[web-vitals] envio ao servidor indisponível', err);
    return false;
  }
}

/** Estado do interruptor: `unknown` = ainda não lido (conta como desligado). */
let _vitalsSwitch: 'unknown' | 'on' | 'off' = 'unknown';
/** Sorteio da amostragem deste documento (`null` = `initWebVitals` não rodou). */
let _vitalsSampled: boolean | null = null;
/** Trava de um lote por documento — `pagehide` e `visibilitychange` disparam juntos. */
let _vitalsEnviado = false;

/**
 * Lê o interruptor nas duas fontes, uma vez por documento. Falha de leitura
 * (rede, sessão anônima, RLS) desliga — telemetria não pode quebrar a tela.
 */
async function loadVitalsSwitch(): Promise<void> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const [flag, ajuste] = await Promise.all([
      supabase.from('feature_flags').select('enabled').eq('key', WEB_VITALS_SWITCH_KEY).limit(1),
      supabase.from('global_settings').select('value').eq('key', WEB_VITALS_SWITCH_KEY).limit(1),
    ]);
    const pelaFlag = (flag.data as Array<{ enabled: boolean }> | null)?.[0]?.enabled === true;
    const peloAjuste = switchEnabled((ajuste.data as Array<{ value: string | null }> | null)?.[0]?.value ?? null);
    _vitalsSwitch = pelaFlag || peloAjuste ? 'on' : 'off';
  } catch (err) {
    _vitalsSwitch = 'off';
    log.debug('[web-vitals] interruptor indisponível', err);
  }
}

/**
 * Lote do documento no unload. Sem `await` de propósito: `pagehide` não espera
 * promessa. Um lote por documento, mesmo que o envio falhe.
 */
function flushVitalsToServer(): void {
  if (_vitalsEnviado || _vitalsSampled !== true || _vitalsSwitch !== 'on') return;
  const samples = buildVitalSamples(
    getWebVitalsReport(),
    normalizeVitalRoute(typeof window === 'undefined' ? '' : window.location.pathname),
    versaoDoApp(),
  );
  if (samples.length === 0) return;
  _vitalsEnviado = true;
  void sendVitalSamples(samples);
}
