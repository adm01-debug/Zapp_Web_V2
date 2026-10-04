/**
 * Regressão do achado DASH-REALTIME-001 (item 37 do BACKLOG_VERIFICADO):
 * "Realtime/refresh misturam escopo, conexão, batch mutável e janelas".
 *
 * Este arquivo é a prova em vermelho: nenhum destes testes passa no código atual
 * (a correção é o cartão seguinte; aqui não se toca em código de produção).
 *
 * Contrato que o hook precisa cumprir (é o que cada `expect` abaixo cobra):
 *  1. fila de updater     — o flush de 4s aplica o lote INTEIRO, uma vez cada delta
 *                           (hoje o updater lê o objeto `pending` já zerado na linha
 *                           seguinte e todos os deltas de unread/contatos se perdem);
 *  2. evento no snapshot  — delta que chega com o snapshot inicial em voo sobrevive
 *                           ao snapshot (reconciliar snapshot com watermark, não
 *                           sobrescrever o que chegou depois);
 *  3. mudança de filtro   — o hook aceita o escopo do topo (fila/agente) e re-lê
 *                           escopado quando ele muda (hoje o realtime não recebe filtro);
 *  4. dupla entrega       — 1 decremento por transição não-lida→lida, por contato:
 *                           reentrega do mesmo evento e mensagem do agente não contam;
 *  5. hora expirando      — a janela de 1 h do próprio hook expira o evento, sem
 *                           depender do refresh de 5 min para reconciliar;
 *  6. conexão × leitura   — `isConnected` é o estado DO CANAL: sucesso da leitura não
 *                           liga; e leitura com erro não pode virar 0 silencioso na tela.
 *
 * Comando local: bun run test src/hooks/analytics/__tests__/useRealtimeDashboard.regressao.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

type RealtimePayload = {
  new: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
};
type RealtimeHandler = (payload: RealtimePayload) => void;

type QueryResult = { data: unknown; count: number | null; error: { message: string } | null };
type QueryCall = { table: string; method: string; args: unknown[] };

type QueryBuilder = {
  then: (
    onFulfilled?: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise<unknown>;
} & Record<
  'select' | 'eq' | 'neq' | 'gte' | 'lt' | 'lte' | 'not' | 'is' | 'in' | 'order' | 'limit' | 'range' | 'match' | 'or',
  (...args: unknown[]) => QueryBuilder
>;

// ---------------------------------------------------------------------------
// Banco falso: o que a leitura inicial devolve em cada recorte.
// ---------------------------------------------------------------------------
const db = {
  unread: 0,
  newContactsToday: 0,
  messagesThisHour: 0,
  messagesLastHour: 0,
  activeContacts: [] as string[],
};

let failReads = false; // a leitura rejeita (rede/RLS fora do ar)
let errorReads = false; // a leitura responde com { count: null, error } (erro tratado como 0)
let gateReads = false; // a leitura fica pendente até releaseGates() (snapshot em voo)

const gates: Array<() => void> = [];
const queryCalls: QueryCall[] = [];
const channelHandlers = new Map<string, RealtimeHandler>();
let statusCallback: ((status: string) => void) | undefined;

function planFor(table: string, calls: QueryCall[]): QueryResult {
  if (errorReads) return { data: null, count: null, error: { message: 'leitura falhou' } };
  if (table === 'contacts') return { data: null, count: db.newContactsToday, error: null };

  const select = calls.find(c => c.method === 'select');
  const selected = typeof select?.args[0] === 'string' ? (select.args[0] as string) : '';
  if (selected.includes('contact_id')) {
    return { data: db.activeContacts.map(contact_id => ({ contact_id })), count: null, error: null };
  }

  const filtrando = (coluna: string) => calls.some(c => c.method === 'eq' && c.args[0] === coluna);
  if (filtrando('is_read') && filtrando('sender')) return { data: null, count: db.unread, error: null };
  if (calls.some(c => c.method === 'lt' && c.args[0] === 'created_at')) {
    return { data: null, count: db.messagesLastHour, error: null };
  }
  return { data: null, count: db.messagesThisHour, error: null };
}

function createBuilder(table: string): QueryBuilder {
  const calls: QueryCall[] = [];
  let resolver!: (result: QueryResult) => void;
  let rejeitar!: (erro: Error) => void;
  const promise = new Promise<QueryResult>((resolve, reject) => {
    resolver = resolve;
    rejeitar = reject;
  });

  function record(method: string, args: unknown[]) {
    const chamada: QueryCall = { table, method, args };
    calls.push(chamada);
    queryCalls.push(chamada);
  }

  const settle = () => {
    if (failReads) {
      rejeitar(new Error(`leitura de ${table} falhou`));
      return;
    }
    resolver(planFor(table, calls));
  };

  const metodo = (nome: string) => (...args: unknown[]) => {
    record(nome, args);
    return builder;
  };

  const builder: QueryBuilder = {
    select: metodo('select'),
    eq: metodo('eq'),
    neq: metodo('neq'),
    gte: metodo('gte'),
    lt: metodo('lt'),
    lte: metodo('lte'),
    not: metodo('not'),
    is: metodo('is'),
    in: metodo('in'),
    order: metodo('order'),
    limit: metodo('limit'),
    range: metodo('range'),
    match: metodo('match'),
    or: metodo('or'),
    then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
  };

  if (gateReads) gates.push(settle);
  else Promise.resolve().then(settle);

  return builder;
}

const mockFrom = vi.fn((table: string) => createBuilder(table));
const mockRemoveChannel = vi.fn();
const mockChannel = vi.fn(() => {
  const instance = {
    on: vi.fn((_tipo: string, filtro: { event: string; table: string }, handler: RealtimeHandler) => {
      channelHandlers.set(`${filtro.event}:${filtro.table}`, handler);
      return instance;
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      statusCallback = callback;
      return instance;
    }),
  };
  return instance;
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    channel: () => mockChannel(),
    removeChannel: (canal: unknown) => mockRemoveChannel(canal),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useRealtimeDashboard } from '@/hooks/analytics/useRealtimeDashboard';

export type RealtimeScope = { queueId?: string | null; agentId?: string | null };

/** Contrato em teste: o hook precisa aceitar o escopo do topo (fila/agente) que os KPIs já
 * recebem. O cast deixa o arquivo compilar antes E depois da correção — ele não existe para
 * "esconder" a assinatura, e sim para o teste poder exigir uma que ainda não existe. */
const useRealtimeDashboardEscopado = useRealtimeDashboard as unknown as (
  filters?: RealtimeScope
) => ReturnType<typeof useRealtimeDashboard>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function flush() {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function releaseGates() {
  const pendentes = gates.splice(0);
  for (const settle of pendentes) settle();
}

function emit(event: 'INSERT' | 'UPDATE', table: string, payload: RealtimePayload) {
  const handler = channelHandlers.get(`${event}:${table}`);
  if (!handler) throw new Error(`nenhum handler registrado para ${event}:${table}`);
  act(() => handler(payload));
}

function emitStatus(status: string) {
  if (!statusCallback) throw new Error('o canal não registrou callback de status');
  const callback = statusCallback;
  act(() => callback(status));
}

/** Alguma chamada de leitura levou este valor (escopo) — vale .eq/.match/.in/.or. */
function leituraComEscopo(escopo: string) {
  return queryCalls.some(call =>
    call.args.some(arg =>
      typeof arg === 'string'
        ? arg.includes(escopo)
        : JSON.stringify(arg ?? '').includes(escopo)
    )
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00.000-03:00'));
  queryCalls.length = 0;
  gates.length = 0;
  channelHandlers.clear();
  statusCallback = undefined;
  failReads = false;
  errorReads = false;
  gateReads = false;
  db.unread = 0;
  db.newContactsToday = 0;
  db.messagesThisHour = 0;
  db.messagesLastHour = 0;
  db.activeContacts = [];
  mockFrom.mockClear();
  mockChannel.mockClear();
  mockRemoveChannel.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useRealtimeDashboard — regressão DASH-REALTIME-001', () => {
  it('1. fila de updater: o flush aplica o lote inteiro, sem perder delta', async () => {
    const { result } = renderHook(() => useRealtimeDashboard());
    await flush();

    emit('INSERT', 'messages', { new: { sender: 'contact' } });
    emit('INSERT', 'messages', { new: { sender: 'contact' } });
    emit('INSERT', 'contacts', { new: { id: 'c1' } });

    // O lote fica na fila até o flush de 4 s: nada é aplicado de forma sincrona.
    expect(result.current.unreadMessages).toBe(0);
    expect(result.current.newContactsToday).toBe(0);

    await advance(4000);

    // O flush aplica os TRÊS deltas do lote, uma vez cada.
    expect(result.current.unreadMessages).toBe(2);
    expect(result.current.newContactsToday).toBe(1);
    expect(result.current.lastMessageAt).not.toBeNull();
  });

  it('2. evento durante o snapshot: delta posterior sobrevive à leitura inicial', async () => {
    gateReads = true;
    const { result } = renderHook(() => useRealtimeDashboard());
    await flush();

    // a leitura inicial ainda está em voo
    expect(result.current.unreadMessages).toBe(0);

    emit('INSERT', 'messages', { new: { sender: 'contact' } });
    emit('INSERT', 'contacts', { new: { id: 'c9' } });
    await advance(4000); // flush enquanto o snapshot está pendente

    // o snapshot chega depois, com os números de ANTES do evento
    db.unread = 5;
    db.newContactsToday = 7;
    gateReads = false;
    releaseGates();
    await flush();

    // 5 do snapshot + 1 delta que chegou depois dele
    expect(result.current.unreadMessages).toBe(6);
    expect(result.current.newContactsToday).toBe(8);
  });

  it('3. mudança de filtro: re-lê escopado pela fila do topo', async () => {
    db.newContactsToday = 3;
    const { result, rerender } = renderHook(
      (props: { filters: RealtimeScope }) => useRealtimeDashboardEscopado(props.filters),
      { initialProps: { filters: { queueId: 'q1' } as RealtimeScope } }
    );
    await flush();

    expect(leituraComEscopo('q1')).toBe(true);
    const leiturasDoPrimeiroEscopo = mockFrom.mock.calls.length;

    db.newContactsToday = 7; // o recorte q2 tem 7 contatos hoje
    rerender({ filters: { queueId: 'q2' } });
    await flush();

    expect(mockFrom.mock.calls.length).toBeGreaterThan(leiturasDoPrimeiroEscopo);
    expect(leituraComEscopo('q2')).toBe(true);
    expect(result.current.newContactsToday).toBe(7);
  });

  it('4. dupla entrega: 1 decremento por transição de contato, sem repetir', async () => {
    db.unread = 3;
    const { result } = renderHook(() => useRealtimeDashboard());
    await flush();
    expect(result.current.unreadMessages).toBe(3);

    const leituraDoContato = {
      new: { id: 'm1', sender: 'contact', is_read: true },
      old: { id: 'm1', is_read: false },
    };
    emit('UPDATE', 'messages', leituraDoContato);
    emit('UPDATE', 'messages', leituraDoContato); // reentrega do MESMO evento
    emit('UPDATE', 'messages', {
      new: { id: 'm2', sender: 'agent', is_read: true },
      old: { id: 'm2', is_read: false },
    });
    emit('UPDATE', 'messages', {
      new: { id: 'm3', sender: 'contact', is_read: true },
      old: { id: 'm3', is_read: true },
    });

    await advance(4000);

    // Só a primeira transição (contato, não-lida → lida) decrementa: a reentrega, a
    // mensagem do agente e a transição que já estava lida não mexem no contador.
    expect(result.current.unreadMessages).toBe(2);
  });

  it('5. hora expirando: a janela de 1 h expira sem depender do refresh de 5 min', async () => {
    const { result } = renderHook(() => useRealtimeDashboard());
    await flush();

    emit('INSERT', 'messages', { new: { sender: 'contact' } });
    await advance(4000);
    expect(result.current.messagesThisHour).toBe(1);

    // O refresh de 5 min é quem reconcilia o contador hoje; quando ele falha, quem
    // tem que expirar o evento é a janela local do próprio hook.
    failReads = true;
    for (let minuto = 1; minuto <= 61; minuto += 1) {
      await advance(60_000);
    }

    expect(result.current.messagesThisHour).toBe(0);
  });

  it('6. conexão × leitura: sucesso da leitura não liga isConnected', async () => {
    // o canal assina ANTES de a leitura inicial resolver — é o caso real de rede
    gateReads = true;
    const { result } = renderHook(() => useRealtimeDashboard());
    await flush();

    emitStatus('CHANNEL_ERROR');
    db.unread = 1;
    gateReads = false;
    releaseGates();
    await flush();

    // A leitura inicial respondeu bem, mas o canal não está inscrito: isConnected é o
    // estado DO CANAL — não pode ser ligado pelo fetch.
    expect(result.current.unreadMessages).toBe(1);
    expect(result.current.isConnected).toBe(false);

    emitStatus('SUBSCRIBED');
    await flush();
    expect(result.current.isConnected).toBe(true);
  });

  it('7. leitura com erro não zera o que já está na tela', async () => {
    db.unread = 4;
    db.newContactsToday = 2;
    const { result } = renderHook(() => useRealtimeDashboard());
    await flush();
    expect(result.current.unreadMessages).toBe(4);

    errorReads = true; // o refresh de 5 min responde { count: null, error }
    await advance(5 * 60_000);

    // erro não é zero: o último valor bom continua na tela
    expect(result.current.unreadMessages).toBe(4);
    expect(result.current.newContactsToday).toBe(2);
  });
});
