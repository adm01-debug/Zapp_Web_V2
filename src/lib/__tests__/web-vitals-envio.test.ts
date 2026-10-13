import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

/**
 * PE-108 / SL-231 — envio AMOSTRADO dos Web Vitals ao servidor.
 *
 * O coletor já media no cliente e o dado morria ali. Agora ~10% dos documentos
 * mandam UM lote no unload pela RPC `record_web_vital` (o cliente não tem
 * INSERT em `web_vitals_samples`), com rota normalizada e interruptor.
 *
 * O teste exercita o módulo REAL (`initWebVitals`) com o `PerformanceObserver`
 * trocado por um dublê e o cliente Supabase mockado, no mesmo caminho dos
 * testes `web-vitals-cls-inp.test.ts` / `web-vitals-fcp-tti.test.ts`.
 */

const estado = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: 1, error: null })),
  linhas: {
    feature_flags: [] as Array<Record<string, unknown>>,
    global_settings: [] as Array<Record<string, unknown>>,
  },
  leituras: 0,
  erroLeitura: false,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (tabela: string) => {
    const resultado = () => {
      estado.leituras += 1;
      if (estado.erroLeitura) return { data: null, error: { message: 'sem rede' } };
      return { data: estado.linhas[tabela as 'feature_flags' | 'global_settings'] ?? [], error: null };
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      limit: () => builder,
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
        Promise.resolve(resultado()).then(ok, falha),
    };
    return builder;
  };
  return { supabase: { from, rpc: estado.rpc } };
});

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

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
}

/** Sobe o módulo do zero, liga o coletor e espera o interruptor ser lido. */
async function subirColetor() {
  vi.resetModules();
  const callbacks = installPerformanceObserver(['paint']);
  const mod = await import('../web-vitals');
  mod.initWebVitals();
  // O interruptor é lido de forma assíncrona no init: só depois dele o lote pode sair.
  await vi.waitFor(() => expect(estado.leituras).toBeGreaterThanOrEqual(2));
  return { mod, callbacks };
}

function fcp(startTime: number) {
  return { name: 'first-contentful-paint', startTime };
}

beforeEach(() => {
  estado.rpc.mockClear();
  estado.rpc.mockImplementation(async () => ({ data: 1, error: null }));
  estado.linhas.feature_flags = [];
  estado.linhas.global_settings = [];
  estado.leituras = 0;
  estado.erroLeitura = false;
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setVisibility('visible');
});

describe('interruptor (chave ausente = desligado)', () => {
  it('liga com as grafias aceitas e desliga no resto', async () => {
    const { switchEnabled } = await import('../web-vitals');
    for (const valor of ['on', 'ON', ' true ', '1', 'yes']) expect(switchEnabled(valor)).toBe(true);
    for (const valor of [null, undefined, '', 'off', 'false', '0', 'sample', 'sim']) {
      expect(switchEnabled(valor)).toBe(false);
    }
  });
});

describe('rota normalizada (sem PII, sem parâmetro)', () => {
  it('corta query string e fragmento', async () => {
    const { normalizeVitalRoute } = await import('../web-vitals');
    expect(normalizeVitalRoute('/admin/relatorios?de=2026#top')).toBe('/admin/relatorios');
  });

  it('troca identificador de linha por :id', async () => {
    const { normalizeVitalRoute } = await import('../web-vitals');
    expect(normalizeVitalRoute('/conversas/8f14e45fceea167a3b1c?tab=1')).toBe('/conversas/:id');
    expect(normalizeVitalRoute('/pedidos/12345')).toBe('/pedidos/:id');
    expect(normalizeVitalRoute('/pedidos/12345/itens')).toBe('/pedidos/:id/itens');
  });

  it('pathname inesperado vira / e o teto de 200 caracteres vale', async () => {
    const { normalizeVitalRoute } = await import('../web-vitals');
    expect(normalizeVitalRoute('')).toBe('/');
    expect(normalizeVitalRoute('relativo')).toBe('/');
    expect(normalizeVitalRoute(null)).toBe('/');
    expect(normalizeVitalRoute('/' + 'a'.repeat(400)).length).toBe(200);
    expect(normalizeVitalRoute('/faced')).toBe('/faced'); // letras 'a'-'f' sozinhas não são id
    // O CHECK da tabela exige ^/[^?#[:space:]]*$ — nada de espaço no resultado.
    expect(normalizeVitalRoute('/a b/c d')).not.toMatch(/[[:space:]]/);
  });
});

describe('amostragem', () => {
  it('sorteia ~rate dos documentos, sem depender de sorte no limite', async () => {
    const { deveAmostrar } = await import('../web-vitals');
    expect(deveAmostrar(0.1, () => 0.05)).toBe(true);
    expect(deveAmostrar(0.1, () => 0.5)).toBe(false);
    expect(deveAmostrar(0.1, () => 0.1)).toBe(false); // limite exato fica fora
    expect(deveAmostrar(1, () => 0.999999)).toBe(true);
    expect(deveAmostrar(0, () => 0)).toBe(false);
    expect(deveAmostrar(Number.NaN, () => 0)).toBe(false);
  });
});

describe('montagem do lote', () => {
  const metrica = (name: string, value: number) => ({ name, value, rating: 'good' as const, delta: value, id: name });

  it('descarta fora de faixa, métrica desconhecida e arredonda', async () => {
    const { buildVitalSamples } = await import('../web-vitals');
    const samples = buildVitalSamples(
      [
        metrica('LCP', 1234.6),
        metrica('CLS', 0.123456),
        metrica('CLS', 11),          // acima do teto da RPC
        metrica('FCP', 700000),      // acima do teto da RPC
        metrica('TTFB', -1),         // negativo
        metrica('XYZ', 100),         // métrica que o coletor não mede
        metrica('INP', Number.NaN),  // não finito
      ],
      '/conversas/:id',
      'build-1',
    );
    expect(samples).toEqual([
      { metric: 'LCP', value: 1235, route: '/conversas/:id', app_version: 'build-1' },
      { metric: 'CLS', value: 0.123, route: '/conversas/:id', app_version: 'build-1' },
    ]);
  });

  it('respeita o teto de 50 amostras por lote', async () => {
    const { buildVitalSamples, WEB_VITALS_MAX_BATCH } = await import('../web-vitals');
    const report = Array.from({ length: 60 }, () => metrica('LCP', 100));
    expect(buildVitalSamples(report, '/', 'unknown')).toHaveLength(WEB_VITALS_MAX_BATCH);
  });
});

describe('envio', () => {
  it('lote vazio não chama a RPC e falha de envio devolve false (silenciosa)', async () => {
    const { sendVitalSamples } = await import('../web-vitals');
    const envioOk = vi.fn(async () => undefined);
    expect(await sendVitalSamples([], envioOk)).toBe(false);
    expect(envioOk).not.toHaveBeenCalled();

    const envioQuebrado = vi.fn(async () => { throw new Error('offline'); });
    expect(
      await sendVitalSamples([{ metric: 'LCP', value: 1, route: '/', app_version: 'unknown' }], envioQuebrado),
    ).toBe(false);
    expect(envioQuebrado).toHaveBeenCalledTimes(1);
  });
});

describe('documento real: pagehide e visibilitychange', () => {
  it('manda UM lote com rota normalizada e sem PII quando o interruptor está ligado', async () => {
    estado.linhas.feature_flags = [{ enabled: true }];
    vi.spyOn(Math, 'random').mockReturnValue(0); // este documento é amostrado
    window.history.replaceState(null, '', '/conversas/8f14e45fceea167a3b1c?tab=1');
    const { callbacks } = await subirColetor();

    callbacks.paint({ getEntries: () => [fcp(1200)] });
    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    const [nome, args] = estado.rpc.mock.calls[0] as unknown as [string, { p_samples: Array<Record<string, unknown>> }];
    expect(nome).toBe('record_web_vital');
    expect(args.p_samples).toEqual([
      { metric: 'FCP', value: 1200, route: '/conversas/:id', app_version: expect.any(String) },
      { metric: 'TTI', value: 1200, route: '/conversas/:id', app_version: expect.any(String) },
    ]);
    // Sem PII: a query string e o id da linha não podem viajar.
    expect(JSON.stringify(args)).not.toContain('8f14e45fceea167a3b1c');
    expect(JSON.stringify(args)).not.toContain('tab=1');
    // `pagehide` e `visibilitychange` disparam juntos: continua um lote por documento.
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(estado.rpc).toHaveBeenCalledTimes(1);
  });

  it('sai pelo visibilitychange quando a aba é ocultada', async () => {
    estado.linhas.global_settings = [{ value: 'true' }]; // a via do cartão
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { callbacks } = await subirColetor();

    callbacks.paint({ getEntries: () => [fcp(900)] });
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
  });

  it('não envia com o interruptor desligado (chave ausente) nem fora do sorteio', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // documento fora dos 10%
    estado.linhas.feature_flags = [{ enabled: true }];
    const primeiro = await subirColetor();
    primeiro.callbacks.paint({ getEntries: () => [fcp(1000)] });
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(estado.rpc).not.toHaveBeenCalled();

    vi.spyOn(Math, 'random').mockReturnValue(0); // agora amostrado, mas interruptor ausente
    estado.linhas.feature_flags = [];
    const segundo = await subirColetor();
    segundo.callbacks.paint({ getEntries: () => [fcp(1000)] });
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it('leitura do interruptor que falha desliga em silêncio', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    estado.erroLeitura = true;
    estado.linhas.feature_flags = [{ enabled: true }];
    const { callbacks } = await subirColetor();

    callbacks.paint({ getEntries: () => [fcp(1000)] });
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(estado.rpc).not.toHaveBeenCalled();
  });
});
