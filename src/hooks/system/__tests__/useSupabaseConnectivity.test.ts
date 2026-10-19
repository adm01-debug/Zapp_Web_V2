/**
 * Testes de `src/hooks/system/useSupabaseConnectivity.ts` (sonda de
 * disponibilidade do backend Supabase).
 *
 * A fronteira dublada é a REDE (`globalThis.fetch`). O hook REAL é exercitado
 * junto do `useNetworkStatus` REAL: o teste controla `navigator.onLine` e os
 * eventos `online`/`offline` do `window`, além de `document.hidden` e dos
 * temporizadores (falsos), para provar as transições de estado, o heartbeat de
 * 60 s, o recuo entre tentativas, a pausa com a aba oculta, a retomada e a
 * limpeza ao desmontar.
 *
 * Regra que estes testes protegem: a sonda é LEVE e nunca usa a Edge Function
 * `health` (nem qualquer `/functions/v1/...`) — aquela consulta o banco
 * (`supabase/functions/health/index.ts` faz `select` em `whatsapp_connections`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://proj.supabase.test',
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import {
  useSupabaseConnectivity,
  nextBackoffDelay,
  CONNECTIVITY_BASE_INTERVAL_MS,
  CONNECTIVITY_MAX_INTERVAL_MS,
  CONNECTIVITY_PROBE_TIMEOUT_MS,
} from '@/hooks/system/useSupabaseConnectivity';

let onlineFlag = true;
let hiddenFlag = false;

function setHidden(value: boolean) {
  hiddenFlag = value;
}

/**
 * Resposta do fetch `no-cors`: o servidor respondeu, mas a resposta é opaca
 * (status 0, corpo invisível para o JS). É o "backend alcançável".
 */
const RESPOSTA = { type: 'opaque', status: 0, ok: false };
/** Falha real de rede/DNS/timeout: nada respondeu. */
const falhaDeRede = () => Promise.reject(new TypeError('Failed to fetch'));

/** URL da sonda número `i` (0-based). */
function urlDaSonda(i: number): string {
  return String(mocks.fetch.mock.calls[i]?.[0]);
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  onlineFlag = true;
  hiddenFlag = false;
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue(RESPOSTA);
  vi.stubGlobal('fetch', mocks.fetch);

  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => onlineFlag,
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hiddenFlag,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSupabaseConnectivity — sonda leve, sem a Edge `health`', () => {
  it('sonda a URL do projeto (auth/v1/health) e nunca uma Edge Function', async () => {
    const { result } = renderHook(() => useSupabaseConnectivity());
    expect(result.current.status).toBe('checking');
    expect(result.current.isChecking).toBe(true);

    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.test/auth/v1/health');
    // A Edge `health` da V2 consulta o banco: nenhuma sonda pode passar por ela.
    expect(url).not.toContain('/functions/');
    expect(init).toMatchObject({ method: 'GET', mode: 'no-cors', cache: 'no-store' });
    // Sem cabeçalhos próprios: GET simples, sem preflight de CORS (paridade V3).
    expect(init.headers).toBeUndefined();
    expect(init.signal).toBeDefined();

    expect(result.current.status).toBe('online');
    expect(result.current.isOnline).toBe(true);
    expect(result.current.consecutiveFailures).toBe(0);
    expect(result.current.lastCheckedAt).not.toBeNull();
  });

  it('respeita o timeout da sonda: sem resposta no prazo, conta falha', async () => {
    mocks.fetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const { result } = renderHook(() => useSupabaseConnectivity());

    await avancar(CONNECTIVITY_PROBE_TIMEOUT_MS);

    expect(result.current.status).toBe('degraded');
    expect(result.current.consecutiveFailures).toBe(1);
    expect(result.current.lastCheckedAt).not.toBeNull();
  });

  it('resposta HTTP não-2xx (o servidor respondeu) ainda conta como online', async () => {
    mocks.fetch.mockResolvedValue({ type: 'basic', status: 500, ok: false });
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();

    expect(result.current.status).toBe('online');
  });
});

describe('useSupabaseConnectivity — transições de estado', () => {
  it('heartbeat de 60 s: sonda de novo a cada minuto com o backend saudável', async () => {
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(result.current.status).toBe('online');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    // 1 s antes do heartbeat: nada novo.
    await avancar(CONNECTIVITY_BASE_INTERVAL_MS - 1_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    await avancar(1_000);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('uma falha marca degraded e a próxima tentativa espera o dobro do intervalo (recuo)', async () => {
    mocks.fetch.mockImplementation(falhaDeRede);
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();

    expect(result.current.status).toBe('degraded');
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.consecutiveFailures).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    // 60 s (o heartbeat base): o recuo dobrado ainda NÃO dispara.
    await avancar(CONNECTIVITY_BASE_INTERVAL_MS);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    // +60 s (120 s no total): agora sim.
    await avancar(CONNECTIVITY_BASE_INTERVAL_MS);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('três falhas seguidas marcam offline', async () => {
    mocks.fetch.mockImplementation(falhaDeRede);
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(result.current.status).toBe('degraded');

    await avancar(120_000);
    expect(result.current.status).toBe('degraded');
    expect(result.current.consecutiveFailures).toBe(2);

    await avancar(240_000);
    expect(result.current.status).toBe('offline');
    expect(result.current.isOffline).toBe(true);
    expect(result.current.consecutiveFailures).toBe(3);
  });

  it('resposta lenta (acima do limite) marca degraded mesmo com sucesso', async () => {
    let liberar: ((value: typeof RESPOSTA) => void) | undefined;
    mocks.fetch.mockImplementation(
      () =>
        new Promise<typeof RESPOSTA>((resolve) => {
          liberar = resolve;
        }),
    );
    const { result } = renderHook(() => useSupabaseConnectivity());

    // 2,5 s de latência (o timeout da sonda é de 6 s, então não aborta).
    await avancar(2_500);
    await act(async () => {
      liberar?.(RESPOSTA);
    });

    expect(result.current.status).toBe('degraded');
    expect(result.current.latencyMs).toBeGreaterThan(2_000);
  });
});

describe('useSupabaseConnectivity — aba oculta e navegador', () => {
  it('pausa o ciclo com a aba oculta e sonda de novo ao voltar', async () => {
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(result.current.status).toBe('online');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    setHidden(true);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await avancar(CONNECTIVITY_MAX_INTERVAL_MS * 2);
    // Aba oculta: nenhuma sonda em background.
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    setHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Ao voltar, sonda imediatamente.
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('online');
  });

  it('navegador offline fica offline sem sondar e volta a sondar ao reconectar', async () => {
    onlineFlag = false;
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();

    expect(result.current.status).toBe('offline');
    expect(mocks.fetch).not.toHaveBeenCalled();

    onlineFlag = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('online');
  });
});

describe('useSupabaseConnectivity — retomada explícita e limpeza', () => {
  it('retryNow força uma sonda imediata e zera as falhas', async () => {
    mocks.fetch.mockImplementation(falhaDeRede);
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(result.current.isDegraded).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    mocks.fetch.mockResolvedValue(RESPOSTA);
    await act(async () => {
      result.current.retryNow();
    });
    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('online');
    expect(result.current.consecutiveFailures).toBe(0);
  });

  it('descarta a resposta de uma sonda obsoleta (corrida) sem apagar o estado novo', async () => {
    const pendentes: Array<(value: typeof RESPOSTA) => void> = [];
    const rejeitados: Array<(reason: unknown) => void> = [];
    mocks.fetch.mockImplementation(
      () =>
        new Promise<typeof RESPOSTA>((resolve, reject) => {
          pendentes.push(resolve);
          rejeitados.push(reject);
        }),
    );
    const { result } = renderHook(() => useSupabaseConnectivity());
    expect(pendentes).toHaveLength(1);

    // retryNow invalida a sonda 1 e começa a sonda 2.
    await act(async () => {
      result.current.retryNow();
    });
    expect(pendentes).toHaveLength(2);

    // A sonda NOVA responde primeiro: estado vira online.
    await act(async () => {
      pendentes[1](RESPOSTA);
    });
    expect(result.current.status).toBe('online');

    // A sonda ANTIGA falha DEPOIS: deve ser descartada.
    await act(async () => {
      rejeitados[0](new TypeError('Failed to fetch'));
    });
    expect(result.current.status).toBe('online');
    expect(result.current.consecutiveFailures).toBe(0);
  });

  it('não sonda mais depois de desmontar', async () => {
    const { unmount } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    unmount();
    await avancar(CONNECTIVITY_MAX_INTERVAL_MS * 2);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('nextBackoffDelay — recuo exponencial', () => {
  it('dobra por falha a partir do heartbeat de 60 s e respeita o teto', () => {
    expect(nextBackoffDelay(1)).toBe(120_000);
    expect(nextBackoffDelay(2)).toBe(240_000);
    expect(nextBackoffDelay(3)).toBe(300_000);
    expect(nextBackoffDelay(5)).toBe(300_000);
  });
});
