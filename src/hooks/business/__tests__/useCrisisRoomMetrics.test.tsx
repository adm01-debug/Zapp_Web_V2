import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// PF-02 / R2-AUTH-036 — Sala de Crise: leitura periódica de verdade e falha que NUNCA
// vira zero. Antes a tela ignorava `.error` e pintava "Operação normal" sobre zero.
const h = vi.hoisted(() => {
  const estado: {
    resposta: { data: unknown; error: { message: string } | null };
    chamadas: number;
  } = { resposta: { data: null, error: null }, chamadas: 0 };

  return {
    estado,
    rpc: (nome: string) => {
      estado.chamadas += 1;
      return Promise.resolve({ ...estado.resposta, fn: nome });
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (nome: string) => h.rpc(nome) },
}));

import {
  useCrisisRoomMetrics,
  parseCrisisRoomSnapshot,
  crisisSeverity,
  CRISIS_ROOM_REFETCH_INTERVAL_MS,
  CRISIS_ROOM_RPC,
} from '../useCrisisRoomMetrics';

const SNAPSHOT_OK = {
  unanswered_messages: 42,
  unanswered_conversations: 12,
  online_agents: 3,
  total_agents: 9,
  sla_breached: 7,
  queue_ratio: 4,
  window_minutes: 60,
  sla_window_hours: 24,
  generated_at: '2026-10-13T19:00:00.000Z',
  cycle_date_sp: '2026-10-13',
};

// QueryClient SEM refetchOnReconnect: a re-sincronização precisa vir do próprio hook.
function wrapperCom({ reconnect = false }: { reconnect?: boolean } = {}) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0, refetchOnReconnect: reconnect, refetchOnWindowFocus: false },
      },
    });
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function definirVisibilidade(valor: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => valor });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useCrisisRoomMetrics — Sala de Crise (PF-02)', () => {
  beforeEach(() => {
    h.estado.resposta = { data: SNAPSHOT_OK, error: null };
    h.estado.chamadas = 0;
    definirVisibilidade('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('busca o agregado da RPC e entrega os 4 cartões com os dois limiares', async () => {
    const { result } = renderHook(() => useCrisisRoomMetrics(), { wrapper: wrapperCom() });

    await waitFor(() => expect(result.current.snapshot).toBeDefined());

    expect(h.estado.chamadas).toBe(1);
    expect(result.current.snapshot?.unansweredMessages).toBe(42);
    expect(result.current.snapshot?.queueRatio).toBe(4);
    expect(result.current.isError).toBe(false);
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0);

    const porChave = Object.fromEntries((result.current.metrics ?? []).map((m) => [m.key, m]));
    // limiares de ATENÇÃO e CRÍTICO juntos (a tela mostra os dois)
    expect(porChave.unanswered_messages).toMatchObject({ attention: 20, critical: 30, severity: 'critical', value: 42 });
    expect(porChave.queue_ratio).toMatchObject({ attention: 10, critical: 15, severity: 'ok', value: 4 });
    expect(porChave.sla_breached).toMatchObject({ attention: 5, critical: 10, severity: 'warning', value: 7 });
    // "Agentes ativos" é piso: 3 fica em atenção (<4) e ainda não é crítico (<2)
    expect(porChave.online_agents).toMatchObject({ attention: 4, critical: 2, severity: 'warning', value: 3 });
    expect(result.current.isCrisis).toBe(true);
  });

  it('erro da RPC vira erro explícito e nunca zero', async () => {
    h.estado.resposta = { data: null, error: { message: 'permission denied' } };
    const { result } = renderHook(() => useCrisisRoomMetrics(), { wrapper: wrapperCom() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('permission denied');
    expect(result.current.snapshot).toBeUndefined();
    expect(result.current.metrics).toBeUndefined();
    // null (não false): não há medição, então não se anuncia "operação normal"
    expect(result.current.isCrisis).toBeNull();
    expect(result.current.dataUpdatedAt).toBe(0);
  });

  it('agregado quebrado (campo ausente) falha em vez de virar zero', async () => {
    h.estado.resposta = { data: { ...SNAPSHOT_OK, unanswered_messages: undefined }, error: null };
    const { result } = renderHook(() => useCrisisRoomMetrics(), { wrapper: wrapperCom() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.metrics).toBeUndefined();
    expect(result.current.isCrisis).toBeNull();
  });

  it('queue_ratio nulo é "não medido", não um zero pintado de verde', async () => {
    h.estado.resposta = { data: { ...SNAPSHOT_OK, queue_ratio: null }, error: null };
    const { result } = renderHook(() => useCrisisRoomMetrics(), { wrapper: wrapperCom() });

    await waitFor(() => expect(result.current.metrics).toBeDefined());
    const carga = (result.current.metrics ?? []).find((m) => m.key === 'queue_ratio');
    expect(carga?.value).toBeNull();
    expect(carga?.severity).toBe('unknown');
  });

  it('atualiza sozinho no intervalo configurado', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCrisisRoomMetrics(), { wrapper: wrapperCom() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.estado.chamadas).toBe(1);
    expect(result.current.refetchIntervalMs).toBe(CRISIS_ROOM_REFETCH_INTERVAL_MS);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRISIS_ROOM_REFETCH_INTERVAL_MS);
    });
    expect(h.estado.chamadas).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CRISIS_ROOM_REFETCH_INTERVAL_MS);
    });
    expect(h.estado.chamadas).toBe(3);
  });

  it('aba oculta pausa o relógio e ao voltar mede de novo na hora', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCrisisRoomMetrics(), { wrapper: wrapperCom() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.estado.chamadas).toBe(1);

    // escondida: nem esperando 2 ciclos sai requisição nova
    await act(async () => {
      definirVisibilidade('hidden');
      await vi.advanceTimersByTimeAsync(CRISIS_ROOM_REFETCH_INTERVAL_MS * 2);
    });
    expect(h.estado.chamadas).toBe(1);
    expect(result.current.refetchIntervalMs).toBe(false);

    // voltou à frente: re-sincroniza sem esperar o próximo ciclo
    await act(async () => {
      definirVisibilidade('visible');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(h.estado.chamadas).toBe(2);
    expect(result.current.refetchIntervalMs).toBe(CRISIS_ROOM_REFETCH_INTERVAL_MS);
  });

  it('reconexão de rede re-sincroniza mesmo com o QueryClient do consumidor desligado', async () => {
    const { result } = renderHook(() => useCrisisRoomMetrics(), {
      wrapper: wrapperCom({ reconnect: false }),
    });
    await waitFor(() => expect(result.current.snapshot).toBeDefined());
    expect(h.estado.chamadas).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(h.estado.chamadas).toBeGreaterThanOrEqual(2));
  });
});

describe('useCrisisRoomMetrics — parsing e severidade', () => {
  it('parse rejeita agregado ausente/ não numérico sem inventar zero', () => {
    expect(() => parseCrisisRoomSnapshot(null)).toThrow(/inválida/);
    expect(() => parseCrisisRoomSnapshot({ ...SNAPSHOT_OK, sla_breached: '3' })).toThrow(/sla_breached/);
    expect(() => parseCrisisRoomSnapshot({ ...SNAPSHOT_OK, queue_ratio: 'x' })).toThrow(/queue_ratio/);
    expect(() => parseCrisisRoomSnapshot({ ...SNAPSHOT_OK, generated_at: '' })).toThrow(/generated_at/);
  });

  it('parse mantém zero medido como zero e ratio nulo como null', () => {
    const zero = parseCrisisRoomSnapshot({ ...SNAPSHOT_OK, unanswered_messages: 0, queue_ratio: null });
    expect(zero.unansweredMessages).toBe(0);
    expect(zero.queueRatio).toBeNull();
  });

  it('severidade: zero é ok, não medido é unknown, limiares de piso contam invertido', () => {
    expect(crisisSeverity('unanswered_messages', 0)).toBe('ok');
    expect(crisisSeverity('unanswered_messages', 20)).toBe('ok'); // atenção é >
    expect(crisisSeverity('unanswered_messages', 21)).toBe('warning');
    expect(crisisSeverity('unanswered_messages', 31)).toBe('critical');
    expect(crisisSeverity('queue_ratio', null)).toBe('unknown');
    expect(crisisSeverity('online_agents', 4)).toBe('ok');
    expect(crisisSeverity('online_agents', 3)).toBe('warning');
    expect(crisisSeverity('online_agents', 1)).toBe('critical');
  });

  it('a RPC chamada é crisis_room_snapshot', () => {
    expect(CRISIS_ROOM_RPC).toBe('crisis_room_snapshot');
  });
});
