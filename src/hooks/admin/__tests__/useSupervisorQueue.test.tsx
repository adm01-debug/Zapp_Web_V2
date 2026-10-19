/**
 * useSupervisorQueue — fila priorizada do supervisor (E60, porte da V3).
 *
 * O dublê do PostgREST EMULA o servidor: aplica os filtros/ordenação/limite
 * registrados pelo builder sobre a fixture. É o que torna o teste do corte
 * significativo — se o hook pedisse `limit` sem `order`, a "200 mais antigas"
 * deixaria de ser verdade e o teste morde.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const TETO = 200;

const h = vi.hoisted(() => ({
  contactsData: [] as Array<Record<string, unknown>>,
  profilesData: [] as Array<Record<string, unknown>>,
  queuesData: [] as Array<Record<string, unknown>>,
  contactsQueue: [] as Array<() => Promise<{ data: unknown; error: unknown }>>,
  rpcError: null as { message: string } | null,
  logError: vi.fn(),
  // Um registro por builder criado, para inspecionar os filtros aplicados.
  builders: [] as Array<{ table: string; calls: Record<string, unknown[][]> }>,
}));

/** Último elemento (o `.at(-1)` do ES2022 não está no `lib` do projeto). */
function ultimo<T>(arr: T[] | undefined): T | undefined {
  return arr && arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

/** Dublê do builder do PostgREST: encadeia, registra chamadas e emula o servidor no `then`. */
function makeBuilder(table: string, resultado?: () => Promise<{ data: unknown; error: unknown }>) {
  const calls: Record<string, unknown[][]> = {};
  const builder: Record<string, unknown> = { table, calls };
  for (const metodo of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
    builder[metodo] = (...args: unknown[]) => {
      (calls[metodo] ??= []).push(args);
      return builder;
    };
  }
  builder.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
    if (resultado) return resultado().then(onFulfilled, onRejected);
    const comErro = h.rpcError !== null && table === tabelaComErro;
    const resposta = comErro
      ? { data: null, error: h.rpcError }
      : { data: emular(table, calls), error: null };
    return Promise.resolve(resposta).then(onFulfilled, onRejected);
  };
  h.builders.push({ table, calls });
  return builder;
}

/** Quando o teste pede erro, a tabela devolve `error` em vez de linhas. */
let tabelaComErro: string | null = null;

/** Emula filtros, ordenação e limite como o PostgREST faria. */
function emular(table: string, calls: Record<string, unknown[][]>) {
  let linhas =
    table === 'contacts'
      ? [...h.contactsData]
      : table === 'profiles'
        ? [...h.profilesData]
        : [...h.queuesData];

  const ultimoIn = ultimo(calls.in);
  if (ultimoIn) {
    const [coluna, valores] = ultimoIn as [string, unknown[]];
    linhas = linhas.filter((l) => valores.includes(l[coluna]));
  }
  const ultimoIs = ultimo(calls.is);
  if (ultimoIs) {
    const [coluna, valor] = ultimoIs as [string, unknown];
    // `is null` casa também com coluna ausente na fixture (é o que o PostgREST faz).
    linhas = linhas.filter((l) =>
      valor === null ? (l[coluna] ?? null) === null : l[coluna] === valor
    );
  }
  const ultimoEq = ultimo(calls.eq);
  if (ultimoEq) {
    const [coluna, valor] = ultimoEq as [string, unknown];
    linhas = linhas.filter((l) => l[coluna] === valor);
  }
  // Ordenações aplicadas da última para a primeira (a precedência é a invertida).
  for (const [coluna, opcoes] of [...(calls.order ?? [])].reverse()) {
    const asc = (opcoes as { ascending?: boolean } | undefined)?.ascending !== false;
    linhas.sort((a, b) => {
      const va = String(a[coluna as string] ?? '');
      const vb = String(b[coluna as string] ?? '');
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }
  const ultimoLimit = ultimo(calls.limit);
  if (ultimoLimit) linhas = linhas.slice(0, ultimoLimit[0] as number);
  return linhas;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'contacts' && h.contactsQueue.length > 0) {
        return makeBuilder(table, h.contactsQueue.shift()!);
      }
      return makeBuilder(table);
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

import { useSupervisorQueue } from '@/hooks/admin/useSupervisorQueue';

function contato(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Ana',
    phone: '5511999999999',
    assigned_to: 'agent-1',
    queue_id: null,
    ai_priority: null,
    risk_score: null,
    updated_at: minutesAgo(1),
    conversation_status: 'open',
    ...over,
  };
}

function buildersDa(tabela: string) {
  return h.builders.filter((b) => b.table === tabela);
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  h.contactsData = [];
  h.profilesData = [];
  h.queuesData = [];
  h.contactsQueue = [];
  h.rpcError = null;
  tabelaComErro = null;
  h.builders = [];
  h.logError.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSupervisorQueue — leitura e priorização', () => {
  it('lê conversas abertas com os filtros certos, resolve nomes e ordena P1→P4', async () => {
    h.contactsData = [
      contato({ id: 'c-normal', name: 'Zelia', assigned_to: null, updated_at: minutesAgo(1), queue_id: 'q1' }),
      contato({ id: 'c-critico', name: 'Ana', risk_score: 90, assigned_to: 'agent-1' }),
    ];
    h.profilesData = [{ id: 'agent-1', name: 'Bruno', role: 'agent', is_active: true }];
    h.queuesData = [{ id: 'q1', name: 'Comercial' }];

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.rows.map((r) => r.id)).toEqual(['c-critico', 'c-normal']);
    expect(result.current.rows[0].priority.level).toBe('critical');
    expect(result.current.rows[0].agentName).toBe('Bruno');
    expect(result.current.rows[1].priority.level).toBe('normal');
    expect(result.current.rows[1].agentName).toBeNull();
    expect(result.current.rows[1].queueName).toBe('Comercial');
    expect(result.current.summary).toEqual({ critical: 1, high: 0, medium: 0, normal: 1 });
    expect(result.current.total).toBe(2);
    expect(result.current.truncated).toBe(false);
    expect(result.current.refreshedAt).toBeInstanceOf(Date);
    expect(result.current.error).toBeNull();

    const contatos = ultimo(buildersDa('contacts'))!;
    expect(contatos.calls.in).toEqual([['conversation_status', ['open', 'waiting', 'pending']]]);
    expect(contatos.calls.is).toEqual([['deleted_at', null]]);
    expect(contatos.calls.order).toEqual([
      ['updated_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(contatos.calls.limit).toEqual([[TETO]]);
  });

  it('conversas resolvidas/fechadas/deletadas não entram na fila', async () => {
    h.contactsData = [
      contato({ id: 'aberta', conversation_status: 'open' }),
      contato({ id: 'aguardando', conversation_status: 'waiting', updated_at: minutesAgo(20) }),
      contato({ id: 'pendente', conversation_status: 'pending' }),
      contato({ id: 'resolvida', conversation_status: 'resolved' }),
      contato({ id: 'fechada', conversation_status: 'closed' }),
      contato({ id: 'arquivada', conversation_status: 'archived' }),
      contato({ id: 'apagada', conversation_status: 'open', deleted_at: new Date().toISOString() }),
    ];

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.rows.map((r) => r.id).sort()).toEqual(['aberta', 'aguardando', 'pendente']);
    expect(result.current.total).toBe(3);
  });

  it('corta em 200 mantendo as MAIS ANTIGAS e sinaliza `truncated`', async () => {
    h.contactsData = Array.from({ length: 250 }, (_, i) =>
      contato({ id: `c-${String(i).padStart(3, '0')}`, updated_at: minutesAgo(250 - i) })
    );

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.rows).toHaveLength(TETO);
    expect(result.current.total).toBe(TETO);
    expect(result.current.truncated).toBe(true);
    // As 200 primeiras (mais tempo de espera) ficam; as 50 mais recentes saem.
    expect(result.current.rows.some((r) => r.id === 'c-000')).toBe(true);
    expect(result.current.rows.some((r) => r.id === 'c-249')).toBe(false);
  });

  it('não marca `truncated` quando a consulta devolve menos que o teto', async () => {
    h.contactsData = [contato({ id: 'unica' })];
    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.truncated).toBe(false);
  });
});

describe('useSupervisorQueue — atualização periódica', () => {
  it('atualiza sozinha no intervalo e para no unmount', async () => {
    h.contactsData = [contato({ id: 'c1' })];
    const { result, unmount } = renderHook(() => useSupervisorQueue({ refreshMs: 25 }));

    await waitFor(() => expect(buildersDa('contacts').length).toBeGreaterThanOrEqual(2), {
      timeout: 2000,
    });
    expect(result.current.loading).toBe(false);

    const antes = buildersDa('contacts').length;
    unmount();
    await new Promise((r) => setTimeout(r, 90));
    expect(buildersDa('contacts').length).toBe(antes);
  });

  it('refreshMs <= 0 desliga o polling (a tela recarrega sob demanda)', async () => {
    h.contactsData = [contato({ id: 'c1' })];
    renderHook(() => useSupervisorQueue({ refreshMs: 0 }));

    await waitFor(() => expect(buildersDa('contacts').length).toBe(1));
    await new Promise((r) => setTimeout(r, 60));
    expect(buildersDa('contacts').length).toBe(1);
  });

  it('o polling NÃO joga a tela de volta no spinner (loading só na primeira carga)', async () => {
    h.contactsData = [contato({ id: 'c1' })];
    const d = deferred<{ data: unknown; error: unknown }>();
    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 25 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    h.contactsQueue = [() => d.promise];
    await waitFor(() => expect(buildersDa('contacts').length).toBeGreaterThanOrEqual(2));
    // Segunda rodada em voo: a fila anterior continua na tela, sem spinner.
    expect(result.current.loading).toBe(false);
    expect(result.current.rows.map((r) => r.id)).toEqual(['c1']);

    // A rodada em voo (e as seguintes do polling) passam a devolver a conversa nova.
    h.contactsData = [contato({ id: 'c2', risk_score: 90 })];
    d.resolve({ data: [contato({ id: 'c2', risk_score: 90 })], error: null });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['c2']));
    expect(result.current.loading).toBe(false);
  });
});

describe('useSupervisorQueue — corrida de respostas', () => {
  it('resposta atrasada de uma rodada antiga é descartada (a fila mais nova vence)', async () => {
    const velha = deferred<{ data: unknown; error: unknown }>();
    const nova = deferred<{ data: unknown; error: unknown }>();
    h.contactsQueue = [() => velha.promise, () => nova.promise];

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    expect(result.current.loading).toBe(true);

    let segunda!: Promise<void>;
    act(() => {
      segunda = result.current.reload();
    });

    // A rodada mais nova responde primeiro...
    await act(async () => {
      nova.resolve({ data: [contato({ id: 'nova', risk_score: 90 })], error: null });
      await segunda;
    });
    expect(result.current.rows.map((r) => r.id)).toEqual(['nova']);
    expect(result.current.loading).toBe(false);

    // ...e a antiga chega depois, com dado velho: não pode sobrescrever.
    await act(async () => {
      velha.resolve({ data: [contato({ id: 'velha' })], error: null });
      await velha.promise;
    });
    expect(result.current.rows.map((r) => r.id)).toEqual(['nova']);
    expect(result.current.loading).toBe(false);
  });
});

describe('useSupervisorQueue — falhas', () => {
  it('erro na consulta de contatos mantém a fila anterior e expõe o erro (sem spinner preso)', async () => {
    h.contactsData = [contato({ id: 'c1' })];
    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((r) => r.id)).toEqual(['c1']);

    h.rpcError = { message: 'conexão caiu' };
    tabelaComErro = 'contacts';
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error?.message).toBe('conexão caiu');
    expect(result.current.rows.map((r) => r.id)).toEqual(['c1']); // fila antiga preservada
    expect(result.current.loading).toBe(false);

    // Recuperação: a próxima rodada limpa o erro.
    h.rpcError = null;
    tabelaComErro = null;
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.error).toBeNull();
  });

  it('falha ao carregar perfis não derruba a fila e é registrada no log', async () => {
    h.contactsData = [contato({ id: 'c1', assigned_to: 'agent-1' })];
    h.profilesData = [{ id: 'agent-1', name: 'Bruno', role: 'agent', is_active: true }];

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    h.rpcError = { message: 'perfis fora do ar' };
    tabelaComErro = 'profiles';
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.rows.map((r) => r.id)).toEqual(['c1']);
    expect(result.current.rows[0].agentName).toBeNull();
    expect(result.current.error).toBeNull(); // o erro de um acessório não vira erro da fila...
    expect(h.logError).toHaveBeenCalledWith('Falha ao carregar perfis da fila', {
      message: 'perfis fora do ar',
    }); // ...mas não é engolido em silêncio
  });
});

describe('useSupervisorQueue — nomes indisponíveis', () => {
  it('falha nos perfis marca `namesUnavailable` (e a recuperação limpa a marca)', async () => {
    h.contactsData = [contato({ id: 'c1', assigned_to: 'agent-1' })];
    h.profilesData = [{ id: 'agent-1', name: 'Bruno', role: 'agent', is_active: true }];

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.namesUnavailable).toBe(false);
    expect(result.current.rows[0].agentName).toBe('Bruno');

    h.rpcError = { message: 'perfis fora do ar' };
    tabelaComErro = 'profiles';
    await act(async () => {
      await result.current.reload();
    });

    // A fila continua na tela, sem nome — e a tela sabe que o nome faltou.
    expect(result.current.rows.map((r) => r.id)).toEqual(['c1']);
    expect(result.current.rows[0].agentName).toBeNull();
    expect(result.current.namesUnavailable).toBe(true);
    expect(result.current.error).toBeNull(); // erro de acessório não vira erro da fila

    h.rpcError = null;
    tabelaComErro = null;
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.namesUnavailable).toBe(false);
    expect(result.current.rows[0].agentName).toBe('Bruno');
  });

  it('falha nas filas também marca `namesUnavailable` (nome da fila ausente não é silêncio)', async () => {
    h.contactsData = [contato({ id: 'c1', queue_id: 'q1' })];
    h.queuesData = [{ id: 'q1', name: 'Comercial' }];

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows[0].queueName).toBe('Comercial');
    expect(result.current.namesUnavailable).toBe(false);

    h.rpcError = { message: 'filas fora do ar' };
    tabelaComErro = 'queues';
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.rows[0].queueName).toBeNull();
    expect(result.current.namesUnavailable).toBe(true);
    expect(h.logError).toHaveBeenCalledWith('Falha ao carregar nomes das filas', {
      message: 'filas fora do ar',
    });
  });
});

describe('useSupervisorQueue — visibilidade da aba', () => {
  let oculta = false;

  function definirOculta(valor: boolean) {
    oculta = valor;
  }

  beforeEach(() => {
    oculta = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculta });
  });

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).hidden;
  });

  it('aba oculta não consulta; ao voltar recarrega uma vez e retoma o polling', async () => {
    h.contactsData = [contato({ id: 'c1' })];
    definirOculta(true);

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 25 }));

    // Oculta: nem a carga inicial consulta o banco.
    await new Promise((r) => setTimeout(r, 80));
    expect(buildersDa('contacts')).toHaveLength(0);
    expect(result.current.loading).toBe(true);

    // Voltou para a aba: recarrega na hora (o polling de 25 ms pode somar mais rodadas).
    definirOculta(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(buildersDa('contacts').length).toBeGreaterThanOrEqual(1);

    // Ficou oculta de novo: o relógio para.
    definirOculta(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const antes = buildersDa('contacts').length;
    await new Promise((r) => setTimeout(r, 90));
    expect(buildersDa('contacts')).toHaveLength(antes);

    // Voltou: recarrega outra vez (a fila pode ter andado enquanto a aba estava oculta).
    definirOculta(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(buildersDa('contacts').length).toBeGreaterThanOrEqual(antes + 1));
  });

  it('com o polling desligado (refreshMs 0) voltar para a aba ainda recarrega uma vez', async () => {
    h.contactsData = [contato({ id: 'c1' })];
    definirOculta(true);

    const { result } = renderHook(() => useSupervisorQueue({ refreshMs: 0 }));
    await new Promise((r) => setTimeout(r, 40));
    expect(buildersDa('contacts')).toHaveLength(0);

    definirOculta(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(buildersDa('contacts')).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 60));
    expect(buildersDa('contacts')).toHaveLength(1);
  });
});
