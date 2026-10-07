import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Regressão do achado DASH-REALTIME-001 (item 37 do BACKLOG_VERIFICADO):
// "Realtime/refresh misturam escopo, conexão, batch mutável e janelas".
// O encanamento principal foi corrigido no cartão 261005070775c0 (commit
// c91bd77ef, na base dia/2026-10-06) — o escopo já tem teste próprio em
// useRealtimeDashboard.escopo.test.tsx. Este arquivo fixa os OUTROS eixos do
// título (conexão, lote imutável, janelas e a fronteira snapshot/evento) para
// que a próxima regressão volte a doer aqui.
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

/** Callback de status do canal: fica guardado para o teste decidir quando e
 * com que estado o canal "responde" (o fetch inicial NUNCA pode ligá-lo). */
let callbackStatus: ((status: string) => void) | null = null;

const mockRemoveChannel = vi.fn();

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
      callbackStatus = callback ?? null;
      return instance;
    }),
  };
  return instance;
});

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
// Mock do PostgREST. `segurarContagens` fecha um portão: as consultas ficam
// pendentes até `abrirPortao()` — é assim que o teste reproduz "leitura em voo"
// e "refresh que não volta".
// ---------------------------------------------------------------------------
let countHora = 10;
let countHoraAnterior = 4;
let countNaoLidas = 3;
let countContatos = 2;

// Portão ÚNICO compartilhado por todas as consultas em voo: abre de uma vez e
// destrava o `Promise.all` inteiro (é assim que o teste controla quando a
// leitura volta e o que aconteceu enquanto ela estava pendente).
let segurarContagens = false;
let portaoAberto: Promise<void> | null = null;
let soltarPortao: (() => void) | null = null;

function portaoAtual(): Promise<void> {
  if (!portaoAberto) {
    portaoAberto = new Promise<void>((r) => {
      soltarPortao = r;
    });
  }
  return portaoAberto;
}

function liberarPortao() {
  segurarContagens = false;
  soltarPortao?.();
  portaoAberto = null;
  soltarPortao = null;
}

type Chamada = { metodo: string; args: unknown[] };

/** Registro de TODAS as consultas montadas (tabela + encadeamento), para o teste
 * conferir a forma da query de produção (ex.: ordem antes do corte). */
const consultasFeitas: Array<{ table: string; chamadas: Chamada[] }> = [];

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
  return { count: null, data: [], error: null };
}

function makeBuilder(table: string) {
  const chamadas: Chamada[] = [];
  consultasFeitas.push({ table, chamadas });
  const builder: Record<string, unknown> = {};
  for (const metodo of ['select', 'gte', 'lt', 'eq', 'not', 'limit', 'order', 'in', 'neq', 'is']) {
    builder[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return builder;
    };
  }
  builder.then = (resolve: (valor: unknown) => unknown, reject?: (erro: unknown) => unknown) => {
    const resposta = Promise.resolve().then(() => resultadoQuery(table, chamadas));
    const liberado = segurarContagens ? portaoAtual().then(() => resposta) : resposta;
    return liberado.then(resolve, reject);
  };
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

/** O flush dos deltas realtime roda num intervalo de 4 s dentro do hook. */
const FLUSH_MS = 4500;

async function resolverMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useRealtimeDashboard — conexão, lote, janela e fronteira snapshot/evento', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    handlersRealtime.length = 0;
    callbackStatus = null;
    consultasFeitas.length = 0;
    segurarContagens = false;
    portaoAberto = null;
    soltarPortao = null;
    countHora = 10;
    countHoraAnterior = 4;
    countNaoLidas = 3;
    countContatos = 2;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('conexão: leitura bem-sucedida não liga o canal; só o status SUBSCRIBED liga', async () => {
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await resolverMicrotasks();

    // Snapshot carregado com sucesso (unread 3) e mesmo assim o canal continua
    // DESLIGADO: sucesso de consulta não é estado de conexão.
    expect(result.current.unreadMessages).toBe(3);
    expect(result.current.isConnected).toBe(false);

    act(() => {
      callbackStatus?.('CHANNEL_ERROR');
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      callbackStatus?.('SUBSCRIBED');
    });
    expect(result.current.isConnected).toBe(true);
  });

  it('lote: os deltas de mensagem e de contato sobrevivem ao flush (updater roda depois)', async () => {
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await resolverMicrotasks();

    act(() => {
      emitirRealtime('messages', 'INSERT', {
        id: 'msg-lote',
        agent_id: 'agente-1',
        sender: 'contact',
        is_read: false,
      });
      emitirRealtime('contacts', 'INSERT', { id: 'ctt-lote', assigned_to: 'agente-1' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    // Os três números vêm do MESMO lote: nenhum delta foi zerado antes do updater.
    expect(result.current.unreadMessages).toBe(4);
    expect(result.current.newContactsToday).toBe(3);
    expect(result.current.messagesThisHour).toBe(11);
  });

  it('janela: chegada sai da hora corrente e o contador volta ao snapshot sem evento novo', async () => {
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await resolverMicrotasks();
    expect(result.current.messagesThisHour).toBe(10);

    act(() => {
      emitirRealtime('messages', 'INSERT', {
        id: 'msg-janela',
        agent_id: 'agente-1',
        sender: 'contact',
        is_read: false,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(result.current.messagesThisHour).toBe(11);

    // Refresh de 5 min travado de propósito: o número só pode voltar a 10 se a
    // PRÓPRIA janela do hook expirar a chegada (nada de esperar o refresh).
    segurarContagens = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61 * 60 * 1000);
    });

    expect(result.current.messagesThisHour).toBe(10);
    expect(result.current.unreadMessages).toBe(4);
  });

  it('fronteira snapshot/evento: chegada durante a leitura em voo não é perdida pelo snapshot', async () => {
    segurarContagens = true;
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await resolverMicrotasks();

    // Chegou ANTES de o snapshot voltar: a leitura em voo não pode apagá-la.
    act(() => {
      emitirRealtime('messages', 'INSERT', {
        id: 'msg-em-voo',
        agent_id: 'agente-1',
        sender: 'contact',
        is_read: false,
      });
    });

    segurarContagens = false;
    await act(async () => {
      liberarPortao();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.messagesThisHour).toBe(11);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(result.current.unreadMessages).toBe(4);
    expect(result.current.newContactsToday).toBe(2);
  });

  it('não lidas: só a transição não-lida → lida de mensagem DO CONTATO decrementa, e uma vez só', async () => {
    const { result } = renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await resolverMicrotasks();
    expect(result.current.unreadMessages).toBe(3);

    act(() => {
      emitirRealtime(
        'messages',
        'UPDATE',
        { id: 'msg-lida', agent_id: 'agente-1', sender: 'contact', is_read: true },
        { is_read: false }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });
    expect(result.current.unreadMessages).toBe(2);

    // Reentrega do MESMO evento (mesmo id): não decrementa de novo.
    act(() => {
      emitirRealtime(
        'messages',
        'UPDATE',
        { id: 'msg-lida', agent_id: 'agente-1', sender: 'contact', is_read: true },
        { is_read: false }
      );
    });
    // Mensagem DO AGENTE não reduz as não lidas do contato.
    act(() => {
      emitirRealtime(
        'messages',
        'UPDATE',
        { id: 'msg-agente', agent_id: 'agente-1', sender: 'agent', is_read: true },
        { is_read: false }
      );
    });
    // Já estava lida: não é transição.
    act(() => {
      emitirRealtime(
        'messages',
        'UPDATE',
        { id: 'msg-ja-lida', agent_id: 'agente-1', sender: 'contact', is_read: true },
        { is_read: true }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    });

    expect(result.current.unreadMessages).toBe(2);
  });

  it('conversas ativas: a consulta leva ordem determinística com desempate ANTES do corte de 5000', async () => {
    renderHook(() => useRealtimeDashboard({ agentId: 'agente-1' }));
    await resolverMicrotasks();

    // A consulta de conversas ativas é a única que lista `contact_id` sem `head`.
    const consulta = consultasFeitas.find(
      c => c.table === 'messages' && c.chamadas.some(x => x.metodo === 'not')
    );
    expect(consulta).toBeDefined();
    const metodos = consulta!.chamadas.map(c => c.metodo);

    // Sem `.order()` o corte devolve subconjunto arbitrário; o desempate por id
    // evita dois empates de created_at caírem em ordens diferentes.
    const ordens = consulta!.chamadas.filter(c => c.metodo === 'order');
    expect(ordens.map(o => o.args[0])).toEqual(['created_at', 'id']);
    expect(ordens.every(o => (o.args[1] as { ascending?: boolean }).ascending === false)).toBe(true);
    expect(metodos.indexOf('order')).toBeLessThan(metodos.lastIndexOf('limit'));
  });
});
