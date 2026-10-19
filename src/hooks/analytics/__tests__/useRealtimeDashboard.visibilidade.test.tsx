import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Regressão do cartão t_264db8df: o snapshot do dashboard rodava num
// `setInterval(fetchInitialData, 5 * 60 * 1000)` que ignorava
// `document.visibilityState` e `navigator.onLine` — a cada 5 minutos saíam 4
// contagens exatas e uma leitura de até 5000 linhas mesmo com a aba oculta, e
// os contadores não se corrigiam ao voltar de uma queda. Estes testes fixam o
// comportamento novo: aba oculta/offline NÃO lê; o foco e a rede refazem o
// snapshot imediatamente (uma vez); visível e online continua de 5 em 5 min.
// ---------------------------------------------------------------------------

type RealtimePayload = {
  new: Record<string, unknown>;
  old?: Record<string, unknown>;
};

const handlersRealtime: Array<{
  table: string;
  event: string;
  handler: (payload: RealtimePayload) => void;
}> = [];

const mockChannel = vi.fn((_topic: string) => {
  const instance = {
    on: vi.fn(
      (
        _tipo: string,
        filtro: { event: string; table: string },
        handler: (payload: RealtimePayload) => void
      ) => {
        handlersRealtime.push({ table: filtro.table, event: filtro.event, handler });
        return instance;
      }
    ),
    subscribe: vi.fn(() => instance),
  };
  return instance;
});

const mockRemoveChannel = vi.fn();

type Chamada = { metodo: string; args: unknown[] };

/** Todas as consultas montadas (`from()`), na ordem em que o hook as pediu. */
const consultasFeitas: Array<{ table: string; chamadas: Chamada[] }> = [];

/** Uma rodada completa do snapshot = 4 contagens (`head: true`) + a lista de
 * `contact_id` das conversas ativas. */
const CONSULTAS_POR_RODADA = 5;

function resultadoQuery(table: string, chamadas: Chamada[]) {
  const select = chamadas.find(c => c.metodo === 'select');
  const ehContagem = (select?.args[1] as { head?: boolean } | undefined)?.head === true;
  if (ehContagem && table === 'contacts') return { count: 2, data: null, error: null };
  if (ehContagem && table === 'messages') {
    if (chamadas.some(c => c.metodo === 'eq' && c.args[0] === 'is_read')) {
      return { count: 3, data: null, error: null };
    }
    if (chamadas.some(c => c.metodo === 'lt')) return { count: 4, data: null, error: null };
    return { count: 10, data: null, error: null };
  }
  return { count: null, data: [{ contact_id: 'contato-1' }], error: null };
}

function makeBuilder(table: string) {
  const chamadas: Chamada[] = [];
  consultasFeitas.push({ table, chamadas });
  const builder: Record<string, unknown> = {};
  for (const metodo of ['select', 'gte', 'lt', 'eq', 'not', 'limit', 'order']) {
    builder[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return builder;
    };
  }
  builder.then = (resolve: (valor: unknown) => unknown, reject?: (erro: unknown) => unknown) =>
    Promise.resolve().then(() => resultadoQuery(table, chamadas)).then(resolve, reject);
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    channel: (topic: string) => mockChannel(topic),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

import { useRealtimeDashboard } from '@/hooks/analytics/useRealtimeDashboard';

const CINCO_MIN = 5 * 60 * 1000;

const visible = (valor: boolean) =>
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: valor ? 'visible' : 'hidden',
  });
const online = (valor: boolean) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: valor });

async function avancar(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useRealtimeDashboard — snapshot de 5 min só com aba visível e online', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    handlersRealtime.length = 0;
    consultasFeitas.length = 0;
    visible(true);
    online(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    visible(true);
    online(true);
  });

  it('aba oculta: nenhuma consulta, nem na montagem nem ao longo de 10 min', async () => {
    visible(false);
    renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await avancar(10 * 60 * 1000);
    expect(consultasFeitas).toHaveLength(0);
  });

  it('voltar ao foco (visibilitychange) refaz o snapshot uma única vez', async () => {
    visible(false);
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await avancar(10 * 60 * 1000);
    expect(consultasFeitas).toHaveLength(0);

    visible(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await avancar();

    expect(consultasFeitas).toHaveLength(CONSULTAS_POR_RODADA);
    expect(result.current.messagesThisHour).toBe(10);
    expect(result.current.unreadMessages).toBe(3);
  });

  it('voltar à rede (online) refaz o snapshot uma única vez', async () => {
    online(false);
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await avancar(10 * 60 * 1000);
    expect(consultasFeitas).toHaveLength(0);

    online(true);
    window.dispatchEvent(new Event('online'));
    await avancar();

    expect(consultasFeitas).toHaveLength(CONSULTAS_POR_RODADA);
    expect(result.current.messagesThisHour).toBe(10);
  });

  it('aba visível e online: o snapshot continua de 5 em 5 min', async () => {
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await avancar();
    expect(consultasFeitas).toHaveLength(CONSULTAS_POR_RODADA);
    expect(result.current.messagesThisHour).toBe(10);

    await avancar(CINCO_MIN);
    expect(consultasFeitas).toHaveLength(2 * CONSULTAS_POR_RODADA);
    expect(result.current.messagesThisHour).toBe(10);
  });

  it('ficar oculta entre duas rodadas não gera leitura extra e o foco retoma', async () => {
    renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await avancar();
    expect(consultasFeitas).toHaveLength(CONSULTAS_POR_RODADA);

    visible(false);
    await avancar(CINCO_MIN);
    expect(consultasFeitas).toHaveLength(CONSULTAS_POR_RODADA);

    visible(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await avancar();
    expect(consultasFeitas).toHaveLength(2 * CONSULTAS_POR_RODADA);
  });
});
