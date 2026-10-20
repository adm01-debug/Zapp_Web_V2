/**
 * Testes de `src/hooks/system/useSupabaseConnectivity.ts` (sonda de
 * disponibilidade do backend Supabase).
 *
 * A fronteira dublada é o cliente Supabase (rede). O hook REAL é exercitado
 * junto do `useNetworkStatus` REAL: o teste controla `navigator.onLine` e os
 * eventos `online`/`offline` do `window`, além de `document.hidden` e dos
 * temporizadores (falsos), para provar as transições de estado, o recuo entre
 * tentativas, a pausa com a aba oculta, a retomada e a limpeza ao desmontar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mocks.invoke(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  useSupabaseConnectivity,
  nextBackoffDelay,
  CONNECTIVITY_BASE_INTERVAL_MS,
  CONNECTIVITY_MAX_INTERVAL_MS,
} from '@/hooks/system/useSupabaseConnectivity';

let onlineFlag = true;
let hiddenFlag = false;

function setHidden(value: boolean) {
  hiddenFlag = value;
}

/** Resposta de sucesso do endpoint de saúde (backend alcançável). */
const OK = { data: null, error: null };
/** Falha de rede: nada respondeu (backend inacessível). */
const REDE = { data: null, error: new FunctionsFetchError({}) };

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
  mocks.invoke.mockResolvedValue(OK);

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
  vi.useRealTimers();
});

describe('useSupabaseConnectivity — transições de estado', () => {
  it('parte em checking e marca online quando o backend responde (sonda leve, sem tabela de usuário)', async () => {
    const { result } = renderHook(() => useSupabaseConnectivity());
    expect(result.current.status).toBe('checking');
    expect(result.current.isChecking).toBe(true);

    await flush();

    // Sonda leve: só o endpoint de saúde, com GET — nunca uma tabela de dados.
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      'health',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.status).toBe('online');
    expect(result.current.isOnline).toBe(true);
    expect(result.current.consecutiveFailures).toBe(0);
    expect(result.current.lastCheckedAt).not.toBeNull();
  });

  it('resposta HTTP não-2xx (servidor respondeu) ainda conta como online', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError({}) });
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();

    expect(result.current.status).toBe('online');
  });

  it('uma falha marca degraded e a próxima tentativa espera o dobro do intervalo (recuo)', async () => {
    mocks.invoke.mockResolvedValue(REDE);
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();

    expect(result.current.status).toBe('degraded');
    expect(result.current.isDegraded).toBe(true);
    expect(result.current.consecutiveFailures).toBe(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    // 30 s: o recuo dobrado ainda NÃO dispara (nada de sonda no intervalo base).
    await avancar(CONNECTIVITY_BASE_INTERVAL_MS);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    // +30 s (60 s no total): agora sim.
    await avancar(CONNECTIVITY_BASE_INTERVAL_MS);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('três falhas seguidas marcam offline', async () => {
    mocks.invoke.mockResolvedValue(REDE);
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(result.current.status).toBe('degraded');

    await avancar(60_000);
    expect(result.current.status).toBe('degraded');
    expect(result.current.consecutiveFailures).toBe(2);

    await avancar(120_000);
    expect(result.current.status).toBe('offline');
    expect(result.current.isOffline).toBe(true);
    expect(result.current.consecutiveFailures).toBe(3);
  });

  it('resposta lenta (acima do limite) marca degraded mesmo com sucesso', async () => {
    let liberar: ((value: { data: null; error: null }) => void) | undefined;
    mocks.invoke.mockImplementation(
      () => new Promise<{ data: null; error: null }>((resolve) => {
        liberar = resolve;
      }),
    );
    const { result } = renderHook(() => useSupabaseConnectivity());

    // 2,5 s de latência (o timeout da sonda é de 6 s, então não aborta).
    await avancar(2_500);
    await act(async () => {
      liberar?.(OK);
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
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    setHidden(true);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await avancar(120_000);
    // Aba oculta: nenhuma sonda em background.
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    setHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Ao voltar, sonda imediatamente.
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('online');
  });

  it('navegador offline fica offline sem sondar e volta a sondar ao reconectar', async () => {
    onlineFlag = false;
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();

    expect(result.current.status).toBe('offline');
    expect(mocks.invoke).not.toHaveBeenCalled();

    onlineFlag = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await flush();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('online');
  });
});

describe('useSupabaseConnectivity — retomada explícita e limpeza', () => {
  it('retryNow força uma sonda imediata e zera as falhas', async () => {
    mocks.invoke.mockResolvedValue(REDE);
    const { result } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(result.current.isDegraded).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    mocks.invoke.mockResolvedValue(OK);
    await act(async () => {
      result.current.retryNow();
    });
    await flush();

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('online');
    expect(result.current.consecutiveFailures).toBe(0);
  });

  it('descarta a resposta de uma sonda obsoleta (corrida) sem apagar o estado novo', async () => {
    const pendentes: Array<(value: { data: null; error: unknown }) => void> = [];
    mocks.invoke.mockImplementation(
      () => new Promise<{ data: null; error: unknown }>((resolve) => {
        pendentes.push(resolve);
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
      pendentes[1](OK);
    });
    expect(result.current.status).toBe('online');

    // A sonda ANTIGA responde com falha DEPOIS: deve ser descartada.
    await act(async () => {
      pendentes[0](REDE);
    });
    expect(result.current.status).toBe('online');
    expect(result.current.consecutiveFailures).toBe(0);
  });

  it('não sonda mais depois de desmontar', async () => {
    const { unmount } = renderHook(() => useSupabaseConnectivity());
    await flush();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    unmount();
    await avancar(CONNECTIVITY_MAX_INTERVAL_MS * 2);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('nextBackoffDelay — recuo exponencial', () => {
  it('dobra por falha e respeita o teto', () => {
    expect(nextBackoffDelay(1)).toBe(60_000);
    expect(nextBackoffDelay(2)).toBe(120_000);
    expect(nextBackoffDelay(3)).toBe(240_000);
    expect(nextBackoffDelay(5)).toBe(300_000);
  });
});
