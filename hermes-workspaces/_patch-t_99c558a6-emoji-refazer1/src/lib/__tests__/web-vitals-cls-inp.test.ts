import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * R2-INF-031 (#489) — o coletor local rotulava como CLS e INP agregações que não
 * são as definições dessas métricas:
 *
 *  - CLS somava TODOS os shifts da sessão visível; a definição (web.dev/articles/cls)
 *    é a MAIOR janela de sessão (shifts a menos de 1 s entre si e a menos de 5 s
 *    desde o primeiro da janela).
 *  - INP usava o maior `duration` bruto; a definição (web.dev/articles/inp) é o p98
 *    das interações — uma interação por `interactionId`, descartando a mais longa
 *    a cada 50 interações.
 *
 * O teste exercita o módulo REAL (`initWebVitals`) com o `PerformanceObserver`
 * trocado por um dublê que guarda os callbacks e permite entregar os lotes na
 * ordem que quisermos — mesmo caminho do probe que confirmou o achado.
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

function shift(value: number, startTime: number) {
  return { value, startTime, hadRecentInput: false };
}

function interaction(interactionId: number, duration: number) {
  return { name: 'click', interactionId, duration };
}

/** Sobe o módulo do zero (ele inicializa uma vez só) e devolve o relatório após o pagehide. */
async function runCollector(input: { shifts?: unknown[]; events?: unknown[] } = {}) {
  vi.resetModules();
  const callbacks = installPerformanceObserver(['layout-shift', 'event']);
  const mod = await import('../web-vitals');
  mod.initWebVitals();
  if (input.shifts) callbacks['layout-shift']({ getEntries: () => input.shifts as unknown[] });
  if (input.events) callbacks.event({ getEntries: () => input.events as unknown[] });
  window.dispatchEvent(new Event('pagehide'));
  return mod.getWebVitalsReport();
}

function metric(report: Array<{ name: string; value: number }>, name: string) {
  const found = report.find((m) => m.name === name);
  expect(found, `métrica ${name} não foi reportada`).toBeDefined();
  return found!.value;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setVisibility('visible');
});

describe('CLS — maior janela de sessão (R2-INF-031)', () => {
  it('shifts separados por 1 s não somam: dois de 0,06 a 2 s davam 0,12, valem 0,06', async () => {
    const report = await runCollector({ shifts: [shift(0.06, 100), shift(0.06, 2100)] });
    expect(metric(report, 'CLS')).toBeCloseTo(0.06, 5);
  });

  it('shifts dentro da mesma janela somam', async () => {
    const report = await runCollector({ shifts: [shift(0.06, 100), shift(0.08, 500)] });
    expect(metric(report, 'CLS')).toBeCloseTo(0.14, 5);
  });

  it('a janela fecha em 5 s desde o primeiro shift', async () => {
    // Shifts encadeados a menos de 1 s entre si: sem o corte de 5 s desde o
    // primeiro, os 7 formariam uma janela só de 0,7. Com o corte, o shift em
    // 5400 (mais de 5 s após o de 0) abre janela nova — a maior vale 0,6.
    const report = await runCollector({
      shifts: [0, 900, 1800, 2700, 3600, 4500, 5400].map((t) => shift(0.1, t)),
    });
    expect(metric(report, 'CLS')).toBeCloseTo(0.6, 5);
  });

  it('mantém a maior janela mesmo quando ela vem antes de bursts menores', async () => {
    const report = await runCollector({
      shifts: [shift(0.2, 100), shift(0.2, 500), shift(0.01, 9000)],
    });
    expect(metric(report, 'CLS')).toBeCloseTo(0.4, 5);
  });

  it('ignora shift com hadRecentInput', async () => {
    const report = await runCollector({
      shifts: [shift(0.06, 100), { value: 0.9, startTime: 300, hadRecentInput: true }],
    });
    expect(metric(report, 'CLS')).toBeCloseTo(0.06, 5);
  });
});

describe('INP — p98 das interações (R2-INF-031)', () => {
  it('com 50 interações descarta a mais longa: pico de 1000 com segunda de 160 vale 160', async () => {
    const events = [
      ...Array.from({ length: 48 }, (_, i) => interaction(i + 1, 48)),
      interaction(49, 160),
      interaction(50, 1000),
    ];
    const report = await runCollector({ events });
    expect(metric(report, 'INP')).toBe(160);
  });

  it('com 49 interações a mais longa ainda é o INP', async () => {
    const events = [
      ...Array.from({ length: 48 }, (_, i) => interaction(i + 1, 48)),
      interaction(49, 1000),
    ];
    const report = await runCollector({ events });
    expect(metric(report, 'INP')).toBe(1000);
  });

  it('ignora eventos que não são interação (interactionId ausente ou 0)', async () => {
    // pointermove/pointerover com duração >= 40 ms chegam como `event` sem
    // interactionId (ou com id 0) e não são interação: o INP vale 100, não 1000.
    const report = await runCollector({
      events: [
        { name: 'pointermove', duration: 1000 },
        { name: 'pointerover', interactionId: 0, duration: 1000 },
        interaction(1, 100),
      ],
    });
    expect(metric(report, 'INP')).toBe(100);
  });

  it('conta cada interactionId uma vez, guardando a maior duração', async () => {
    const events = [interaction(1, 100), interaction(1, 300), interaction(2, 200)];
    const report = await runCollector({ events });
    expect(metric(report, 'INP')).toBe(300);
  });

  it('interação única continua valendo o próprio duration', async () => {
    const report = await runCollector({ events: [interaction(7, 1000)] });
    expect(metric(report, 'INP')).toBe(1000);
  });
});

describe('flush por visibilidade e BFCache (R2-INF-031)', () => {
  it('visibilitychange oculto faz o flush e o retorno (BFCache) zera os acumuladores', async () => {
    vi.resetModules();
    const callbacks = installPerformanceObserver(['layout-shift', 'event']);
    const mod = await import('../web-vitals');
    mod.initWebVitals();

    callbacks['layout-shift']({ getEntries: () => [shift(0.06, 100)] });
    callbacks.event({ getEntries: () => [interaction(1, 500)] });
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(metric(mod.getWebVitalsReport(), 'CLS')).toBeCloseTo(0.06, 5);
    expect(metric(mod.getWebVitalsReport(), 'INP')).toBe(500);

    // Volta do BFCache: o próximo ciclo reporta dados novos, não os antigos.
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    callbacks['layout-shift']({ getEntries: () => [shift(0.25, 8000)] });
    callbacks.event({ getEntries: () => [interaction(2, 120)] });
    window.dispatchEvent(new Event('pagehide'));

    const report = mod.getWebVitalsReport();
    expect(metric(report, 'CLS')).toBeCloseTo(0.25, 5);
    expect(metric(report, 'INP')).toBe(120);
  });
});
