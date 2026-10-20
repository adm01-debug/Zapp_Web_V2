import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock do realtime: o canal do dashboard (tópico exclusivo por instância,
// `uniqueRealtimeTopic`) recebe 3 `.on()` (INSERT messages, INSERT contacts,
// UPDATE messages). Guardamos cada handler pelo (tabela, evento) do filtro para
// disparar o evento certo no teste.
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
        filtro: { event: string; schema: string; table: string },
        handler: (payload: RealtimePayload) => void
      ) => {
        handlersRealtime.push({ table: filtro.table, event: filtro.event, handler });
        return instance;
      }
    ),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return instance;
    }),
  };
  return instance;
});

const mockRemoveChannel = vi.fn();

function emitirRealtime(
  table: string,
  event: 'INSERT' | 'UPDATE',
  novo: Record<string, unknown>,
  antigo?: Record<string, unknown>
) {
  const alvos = handlersRealtime.filter(h => h.table === table && h.event === event);
  if (alvos.length === 0) {
    throw new Error(`Nenhum handler realtime para ${table}/${event}`);
  }
  for (const alvo of alvos) alvo.handler({ new: novo, old: antigo });
}

// ---------------------------------------------------------------------------
// Mock do PostgREST: fetchInitialData dispara 4 contagens (`head: true`) e uma
// lista de contact_id. O builder é encadeável E thenable (os queries são
// aguardados direto via Promise.all / await).
// ---------------------------------------------------------------------------
let countHora = 10;
let countHoraAnterior = 4;
let countNaoLidas = 3;
let countContatos = 2;
let contatosAtivos: Array<{ contact_id: string }> = [];

type Chamada = { metodo: string; args: unknown[] };

function resultadoQuery(table: string, chamadas: Chamada[]) {
  const select = chamadas.find(c => c.metodo === 'select');
  const ehContagem = (select?.args[1] as { head?: boolean } | undefined)?.head === true;
  if (ehContagem && table === 'contacts') {
    return { count: countContatos, data: null, error: null };
  }
  if (ehContagem && table === 'messages') {
    if (chamadas.some(c => c.metodo === 'eq' && c.args[0] === 'is_read')) {
      return { count: countNaoLidas, data: null, error: null };
    }
    if (chamadas.some(c => c.metodo === 'lt')) {
      return { count: countHoraAnterior, data: null, error: null };
    }
    return { count: countHora, data: null, error: null };
  }
  // Lista de contact_id das conversas ativas (sem `head`).
  return { count: null, data: contatosAtivos, error: null };
}

function makeBuilder(table: string) {
  const chamadas: Chamada[] = [];
  const builder: Record<string, unknown> = {};
  for (const metodo of ['select', 'gte', 'lt', 'eq', 'not', 'limit', 'order', 'in', 'neq', 'is']) {
    builder[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return builder;
    };
  }
  builder.then = (
    resolve: (valor: unknown) => unknown,
    reject?: (erro: unknown) => unknown
  ) => Promise.resolve(resultadoQuery(table, chamadas)).then(resolve, reject);
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
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useRealtimeDashboard } from '@/hooks/analytics/useRealtimeDashboard';
import type { RealtimeDashboardScope } from '@/hooks/analytics/useRealtimeDashboard';

/** O flush dos deltas realtime roda num intervalo de 4 s dentro do hook. */
const FLUSH_MS = 4500;

async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useRealtimeDashboard — recorte de escopo nos eventos realtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    handlersRealtime.length = 0;
    countHora = 10;
    countHoraAnterior = 4;
    countNaoLidas = 3;
    countContatos = 2;
    contatosAtivos = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('com agente ativo, evento de OUTRO agente não altera unreadMessages, newContactsToday nem messagesThisHour', async () => {
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await flushMicrotasks();

    expect(result.current.unreadMessages).toBe(3);
    expect(result.current.newContactsToday).toBe(2);
    expect(result.current.messagesThisHour).toBe(10);

    // Eventos de outro agente: INSERT de mensagem do contato, INSERT de contato
    // e transição não-lida → lida — nada disso pode mexer nos contadores.
    act(() => {
      emitirRealtime('messages', 'INSERT', {
        id: 'msg-outro',
        agent_id: 'agente-2',
        sender: 'contact',
        is_read: false,
      });
      emitirRealtime('contacts', 'INSERT', {
        id: 'ctt-outro',
        assigned_to: 'agente-2',
        queue_id: 'fila-9',
      });
      emitirRealtime(
        'messages',
        'UPDATE',
        { id: 'msg-outro-2', agent_id: 'agente-2', sender: 'contact', is_read: true },
        { is_read: false }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    expect(result.current.unreadMessages).toBe(3);
    expect(result.current.newContactsToday).toBe(2);
    expect(result.current.messagesThisHour).toBe(10);

    // Contraprova: evento do MESMO agente continua contando (o teste não é vazio).
    act(() => {
      emitirRealtime('messages', 'INSERT', {
        id: 'msg-mesmo',
        agent_id: 'agente-1',
        sender: 'contact',
        is_read: false,
      });
      emitirRealtime('contacts', 'INSERT', { id: 'ctt-mesmo', assigned_to: 'agente-1' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    expect(result.current.unreadMessages).toBe(4);
    expect(result.current.newContactsToday).toBe(3);
    expect(result.current.messagesThisHour).toBe(11);
  });

  it('com fila ativa, contato de OUTRA fila não altera newContactsToday', async () => {
    const { result } = renderHook(() => useRealtimeDashboard({ queueId: 'fila-1' }));
    await flushMicrotasks();

    expect(result.current.newContactsToday).toBe(2);

    act(() => {
      emitirRealtime('contacts', 'INSERT', { id: 'ctt-outra-fila', queue_id: 'fila-2' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    expect(result.current.newContactsToday).toBe(2);

    // Contraprova: contato da MESMA fila conta.
    act(() => {
      emitirRealtime('contacts', 'INSERT', { id: 'ctt-mesma-fila', queue_id: 'fila-1' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    expect(result.current.newContactsToday).toBe(3);
  });

  it('com fila ativa (sem agente), mensagem continua contando: `messages` não tem coluna de fila', async () => {
    // Limitação documentada no hook: o recorte de fila não alcança `messages`
    // (não existe messages.queue_id) — igual à leitura inicial, que também só
    // aplica fila em `contacts`. Mensagem de QUALQUER agente entra na conta.
    const { result } = renderHook(() => useRealtimeDashboard({ queueId: 'fila-1' }));
    await flushMicrotasks();

    act(() => {
      emitirRealtime('messages', 'INSERT', {
        id: 'msg-sem-fila',
        agent_id: 'agente-qualquer',
        sender: 'contact',
        is_read: false,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    expect(result.current.messagesThisHour).toBe(11);
    expect(result.current.unreadMessages).toBe(4);
  });

  it('na troca de recorte, chegadas e deltas do recorte anterior não são herdados', async () => {
    const { result, rerender } = renderHook(
      ({ scope }: { scope: RealtimeDashboardScope }) => useRealtimeDashboard(scope),
      { initialProps: { scope: { agentId: 'agente-1' } } }
    );
    await flushMicrotasks();
    expect(result.current.messagesThisHour).toBe(10);

    // Chegada válida no recorte antigo, ainda não refletida em snapshot.
    act(() => {
      emitirRealtime('messages', 'INSERT', {
        id: 'msg-escopo-a',
        agent_id: 'agente-1',
        sender: 'contact',
        is_read: false,
      });
    });

    // Troca de recorte: novo fetch (mesma contagem 10) e refs zerados — a
    // chegada do recorte antigo não pode entrar na conta do recorte novo.
    rerender({ scope: { agentId: 'agente-2' } });
    await flushMicrotasks();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    expect(result.current.messagesThisHour).toBe(10);
    expect(result.current.unreadMessages).toBe(3);
  });

  it('ao desmontar, libera o realtime: remove o CANAL criado pelo hook e zera os temporizadores', async () => {
    // DASH-095 (aceite de DASH-ACCEPTANCE-001): "nenhum recurso permanece ativo
    // após desmontagem". O mock de removeChannel já existia neste arquivo, mas
    // NENHUMA asserção o usava — a limpeza do canal nunca era provada. Aqui o
    // hook é montado, o canal devolvido por supabase.channel é capturado, e a
    // desmontagem tem de remover EXATAMENTE esse canal e derrubar os
    // temporizadores que o hook criou.
    const { unmount } = renderHook(() => useRealtimeDashboard());
    await flushMicrotasks();

    expect(mockChannel).toHaveBeenCalledTimes(1);
    const canalDoHook = mockChannel.mock.results[0]?.value;
    expect(canalDoHook).toBeTruthy();
    // Recurso vivo enquanto montado: flush (4 s) + métricas (60 s) + refresh (5 min).
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(3);

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledWith(canalDoHook);
    expect(vi.getTimerCount()).toBe(0);
  });
});
