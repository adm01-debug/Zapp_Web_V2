import { describe, it, expect, afterEach, vi } from 'vitest';
import budget from '../../../performance-budget.json';

/**
 * SL-105 — alvos de Web Vitals da seção "Métricas Web (targets)" do
 * `docs/IMPROVEMENT_PLAN.md`: **FCP < 1,5 s** e **TTI < 3 s**.
 *
 * O E36 (commit 6fe4eb67e) tornou o `performance-budget.json` a fonte única dos
 * alvos e ligou o coletor a ele — mas só para as cinco métricas que existiam
 * então (LCP, FID, CLS, INP, TTFB). FCP e TTI não estavam nem no orçamento nem
 * no coletor: alvo declarado no plano e nada que o medisse.
 *
 * Este teste cobra as duas pontas:
 *  1. o coletor mede FCP e TTI e classifica cada um com o alvo DO ARQUIVO;
 *  2. nenhum alvo do orçamento é órfão (declarado e não medido) e nenhuma
 *     métrica medida fica sem alvo declarado — o defeito que o E36 corrigiu,
 *     agora como teste de contrato.
 *
 * O `PerformanceObserver` é trocado por um dublê que guarda os callbacks por
 * tipo de entrada, para entregar os lotes na ordem que o teste quiser — mesmo
 * caminho de `web-vitals-cls-inp.test.ts`.
 */

type ObserverCallback = (list: { getEntries: () => unknown[] }) => void;

function installPerformanceObserver(supported: string[]) {
  const callbacks: Record<string, ObserverCallback> = {};
  class FakePerformanceObserver {
    static supportedEntryTypes = supported;
    private readonly callback: ObserverCallback;
    constructor(callback: ObserverCallback) {
      this.callback = callback;
    }
    observe(options: { type: string }) {
      callbacks[options.type] = this.callback;
    }
    disconnect() {}
  }
  vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
  return callbacks;
}

/** Sobe o módulo do zero (ele inicializa uma vez só) com os observadores dublês. */
async function bootCollector() {
  vi.resetModules();
  const callbacks = installPerformanceObserver(['paint', 'longtask']);
  const mod = await import('../web-vitals');
  mod.initWebVitals();
  return { mod, callbacks };
}

function paint(name: string, startTime: number) {
  return { name, startTime };
}

function longTask(startTime: number, duration: number) {
  return { startTime, duration };
}

function metric(report: Array<{ name: string; value: number; rating: string }>, name: string) {
  const found = report.find((m) => m.name === name);
  expect(found, `métrica ${name} não foi reportada`).toBeDefined();
  return found!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('alvos do orçamento × métricas medidas (contrato E36 estendido)', () => {
  it('FCP e TTI são alvos declarados no performance-budget.json, em ms', () => {
    const alvos = budget['web-vitals'] as Record<string, { target: number; poor: number; unit: string }>;
    // Os números do título do cartão: FCP < 1,5 s, TTI < 3 s.
    expect(alvos.FCP.target).toBe(1500);
    expect(alvos.FCP.unit).toBe('ms');
    expect(alvos.TTI.target).toBe(3000);
    expect(alvos.TTI.unit).toBe('ms');
  });

  it('todo alvo do orçamento é medido pelo coletor — nenhum alvo órfão, nenhuma métrica sem alvo', async () => {
    const { mod } = await bootCollector();
    const alvos = Object.keys(budget['web-vitals'] as Record<string, unknown>).sort();
    expect([...mod.COLLECTED_VITALS].sort()).toEqual(alvos);
  });
});

describe('FCP — First Contentful Paint', () => {
  it('reporta o first-contentful-paint (e ignora o first-paint)', async () => {
    const { mod, callbacks } = await bootCollector();
    callbacks.paint({ getEntries: () => [paint('first-paint', 900), paint('first-contentful-paint', 1200)] });

    const fcp = metric(mod.getWebVitalsReport(), 'FCP');
    expect(fcp.value).toBe(1200);
  });

  it('sem first-contentful-paint não inventa FCP a partir do first-paint', async () => {
    const { mod, callbacks } = await bootCollector();
    callbacks.paint({ getEntries: () => [paint('first-paint', 900)] });

    // FCP e first-paint são métricas diferentes: usar uma pela outra só serve
    // para maquiar o número (o first-paint é sempre menor ou igual).
    expect(mod.getWebVitalsReport().some((m) => m.name === 'FCP')).toBe(false);
  });

  it('classifica pelo alvo do arquivo: 1499 é good, 1501 pede atenção', async () => {
    const { mod, callbacks } = await bootCollector();
    callbacks.paint({ getEntries: () => [paint('first-contentful-paint', 1499)] });
    expect(metric(mod.getWebVitalsReport(), 'FCP').rating).toBe('good');

    const segundo = await bootCollector();
    segundo.callbacks.paint({ getEntries: () => [paint('first-contentful-paint', 1501)] });
    expect(metric(segundo.mod.getWebVitalsReport(), 'FCP').rating).toBe('needs-improvement');
  });
});

describe('TTI — Time to Interactive', () => {
  it('vale o fim da última long task seguida de 5 s sem long tasks', async () => {
    vi.useFakeTimers();
    const { mod, callbacks } = await bootCollector();
    callbacks.paint({ getEntries: () => [paint('first-contentful-paint', 1200)] });
    callbacks.longtask({ getEntries: () => [longTask(2000, 300)] });

    // Sem os 5 s de silêncio, o TTI ainda não está fechado.
    vi.advanceTimersByTime(4999);
    expect(mod.getWebVitalsReport().some((m) => m.name === 'TTI')).toBe(false);

    vi.advanceTimersByTime(1);
    const tti = metric(mod.getWebVitalsReport(), 'TTI');
    expect(tti.value).toBe(2300); // 2000 + 300 ms
    expect(tti.rating).toBe('good');
  });

  it('uma long task nova reinicia a janela de 5 s', async () => {
    vi.useFakeTimers();
    const { mod, callbacks } = await bootCollector();
    callbacks.paint({ getEntries: () => [paint('first-contentful-paint', 1000)] });
    callbacks.longtask({ getEntries: () => [longTask(1500, 100)] });

    vi.advanceTimersByTime(4000); // ainda dentro da janela
    callbacks.longtask({ getEntries: () => [longTask(5000, 250)] }); // piora: fim 5250

    vi.advanceTimersByTime(4999);
    expect(mod.getWebVitalsReport().some((m) => m.name === 'TTI')).toBe(false);

    vi.advanceTimersByTime(1);
    expect(metric(mod.getWebVitalsReport(), 'TTI').value).toBe(5250);
  });

  it('sem long task depois do FCP, o TTI vale o próprio FCP', async () => {
    vi.useFakeTimers();
    const { mod, callbacks } = await bootCollector();
    callbacks.paint({ getEntries: () => [paint('first-contentful-paint', 1200)] });
    vi.advanceTimersByTime(5000);

    expect(metric(mod.getWebVitalsReport(), 'TTI').value).toBe(1200);
  });

  it('long task anterior ao FCP não empurra o TTI para trás (TTI é sempre >= FCP)', async () => {
    vi.useFakeTimers();
    const { mod, callbacks } = await bootCollector();
    callbacks.longtask({ getEntries: () => [longTask(500, 200)] }); // fim 700, antes do FCP
    callbacks.paint({ getEntries: () => [paint('first-contentful-paint', 1200)] });
    vi.advanceTimersByTime(5000);

    expect(metric(mod.getWebVitalsReport(), 'TTI').value).toBe(1200);
  });

  it('fecha no pagehide quando a janela de silêncio não chegou a completar', async () => {
    const { mod, callbacks } = await bootCollector();
    callbacks.paint({ getEntries: () => [paint('first-contentful-paint', 1400)] });
    callbacks.longtask({ getEntries: () => [longTask(2600, 400)] });

    window.dispatchEvent(new Event('pagehide'));

    expect(metric(mod.getWebVitalsReport(), 'TTI').value).toBe(3000); // 2600 + 400 ms
  });
});
