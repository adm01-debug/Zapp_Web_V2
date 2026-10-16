/**
 * Testes de `src/hooks/system/useDiagnosticsData.ts` (diagnóstico do sistema).
 *
 * A fronteira dublada é o cliente Supabase — e o duplo imita o PostgREST de
 * verdade: `eq/neq/gte/lt/is/in`, `order`, `limit`, `count/head` e a projeção
 * de colunas do `select`, tudo aplicado sobre as fixtures do teste. Assim o
 * hook REAL consulta dados coerentes e o valor esperado vem da fixture, não de
 * uma cópia da regra.
 *
 * `performance.now` é substituído por um relógio virtual que só anda quando a
 * PRÓPRIA consulta responde (`bumpDb`/`bumpStorage`): a latência medida é
 * exatamente o valor que o teste mandou, sem depender da carga da máquina.
 *
 * Casos de borda: janela de 24 h, base vazia (taxas 0 sem divisão por zero),
 * erro rápido (não pode virar "saudável"), erro de autorização (401/403/42501/
 * PGRST301 e mensagem), limites de latência (healthy/degraded/down), realtime
 * sem ack (unknown), edge function que falha ou lança, dado malformado
 * (contato ausente, content nulo) e reordenação dos logs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type Filtro = [op: string, column: string, value: unknown];
type Consulta = {
  table: string;
  select: string | null;
  head: boolean;
  count: string | null;
  filters: Filtro[];
  order: { column: string; ascending: boolean } | null;
  limit: number | null;
};

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  errosTabela: [] as Array<{
    table: string;
    filtro?: (c: Consulta) => boolean;
    error?: unknown;
    throw?: unknown;
  }>,
  consultas: [] as Consulta[],
  relogio: 0,
  bumpDb: 0,
  bumpStorage: 0,
  storageChamadas: [] as Array<{ bucket: string; path: string; limit: unknown }>,
  erroStorage: null as unknown,
  throwStorage: null as unknown,
  fnResultado: { data: { ok: true }, error: null } as { data: unknown; error: unknown },
  fnLanca: false,
  canalComportamento: 'subscribed' as 'subscribed' | 'error' | 'timedout' | 'closed' | 'silent' | 'throw',
  canaisRemovidos: [] as unknown[],
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    storage: {
      from: (bucket: string) => ({
        list: (path: string, opts: { limit?: number }) => {
          mocks.storageChamadas.push({ bucket, path, limit: opts?.limit });
          if (mocks.throwStorage) return Promise.reject(mocks.throwStorage);
          mocks.relogio += mocks.bumpStorage;
          return Promise.resolve({ data: [], error: mocks.erroStorage });
        },
      }),
    },
    functions: {
      invoke: (nome: string) => {
        if (mocks.fnLanca) return Promise.reject(new Error(`falha ao invocar ${nome}`));
        return Promise.resolve(mocks.fnResultado);
      },
    },
    channel: (nome: string) => {
      if (mocks.canalComportamento === 'throw') throw new Error('realtime indisponível');
      return {
        nome,
        subscribe: (
          cb: (estado: string) => void,
          _timeout?: number,
        ) => {
          if (mocks.canalComportamento === 'subscribed') cb('SUBSCRIBED');
          if (mocks.canalComportamento === 'error') cb('CHANNEL_ERROR');
          if (mocks.canalComportamento === 'timedout') cb('TIMED_OUT');
          if (mocks.canalComportamento === 'closed') cb('CLOSED');
          return undefined;
        },
      };
    },
    removeChannel: (canal: unknown) => {
      mocks.canaisRemovidos.push(canal);
      return Promise.resolve('ok');
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => mocks.toastInfo(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useDiagnosticsData } from '@/hooks/system/useDiagnosticsData';

const AGORA = '2026-10-07T12:00:00.000Z';
const minutosAtras = (m: number) => new Date(Date.parse(AGORA) - m * 60_000).toISOString();
const isoMenos = (ms: number) => new Date(Date.parse(AGORA) - ms).toISOString();

/** Consultas com `head: true` e sem filtro: as contagens "de tabela inteira". */
function ehContagemSemFiltro(c: Consulta) {
  return c.head && c.count === 'exact' && c.filters.length === 0;
}

function consultasDe(table: string): Consulta[] {
  return mocks.consultas.filter((c) => c.table === table);
}

function ehProbeDb(c: Consulta) {
  return c.table === 'contacts' && ehContagemSemFiltro(c);
}

function rodar(consulta: Consulta) {
  const regra = mocks.errosTabela.find(
    (e) => e.table === consulta.table && (!e.filtro || e.filtro(consulta)),
  );
  if (regra) {
    // `throw` = falha de transporte (fetch recusado); `error` = erro do PostgREST.
    if (regra.throw) throw regra.throw;
    return { data: null, error: regra.error, count: null };
  }

  // O relógio virtual anda quando a consulta que mede latência responde.
  if (ehProbeDb(consulta)) mocks.relogio += mocks.bumpDb;

  let rows = (mocks.tabelas[consulta.table] ?? []).slice();
  for (const [op, col, val] of consulta.filters) {
    if (op === 'eq') rows = rows.filter((r) => r[col] === val);
    else if (op === 'neq') rows = rows.filter((r) => r[col] !== val);
    else if (op === 'gte') rows = rows.filter((r) => String(r[col]) >= String(val));
    else if (op === 'lt') rows = rows.filter((r) => String(r[col]) < String(val));
    else if (op === 'is') rows = rows.filter((r) => (r[col] ?? null) === val);
    else if (op === 'in') rows = rows.filter((r) => (val as unknown[]).includes(r[col]));
  }
  const total = rows.length;

  if (consulta.order) {
    const { column, ascending } = consulta.order;
    rows = rows.slice().sort((a, b) => {
      if (String(a[column]) === String(b[column])) return 0;
      return (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1);
    });
  }
  if (consulta.limit !== null) rows = rows.slice(0, consulta.limit);
  if (consulta.select && consulta.select !== '*') {
    const cols = consulta.select.split(',').map((c) => c.trim());
    rows = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  }

  if (consulta.head) return { data: null, error: null, count: total };
  return { data: rows, error: null, count: consulta.count ? total : null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(AGORA));
  mocks.relogio = 0;
  mocks.bumpDb = 0;
  mocks.bumpStorage = 0;
  mocks.errosTabela = [];
  mocks.consultas = [];
  mocks.storageChamadas = [];
  mocks.erroStorage = null;
  mocks.throwStorage = null;
  mocks.fnResultado = { data: { ok: true }, error: null };
  mocks.fnLanca = false;
  mocks.canalComportamento = 'subscribed';
  mocks.canaisRemovidos = [];

  mocks.tabelas = {
    whatsapp_connections: [
      {
        id: 'cn-1',
        instance_id: 'inst-online',
        status: 'connected',
        phone_number: '5511999999999',
        created_at: minutosAtras(600),
        updated_at: minutosAtras(30),
      },
      {
        id: 'cn-2',
        instance_id: 'inst-caida',
        status: 'disconnected',
        phone_number: null,
        created_at: minutosAtras(300),
        updated_at: minutosAtras(20),
      },
    ],
    messages: [
      { id: 'm1', sender: 'agent', status: 'sent', created_at: minutosAtras(1), content: 'Bom dia', contact_id: 'c1' },
      { id: 'm2', sender: 'agent', status: 'delivered', created_at: minutosAtras(2), content: 'Segue o orçamento', contact_id: 'c2' },
      { id: 'm3', sender: 'agent', status: 'read', created_at: minutosAtras(3), content: 'Perfeito', contact_id: 'c3' },
      { id: 'm4', sender: 'agent', status: 'failed', created_at: minutosAtras(4), content: 'Tentativa 1', contact_id: 'c-sem-nome' },
      { id: 'm5', sender: 'agent', status: 'failed', created_at: minutosAtras(6), content: null, contact_id: null },
      { id: 'm6', sender: 'agent', status: 'sending', created_at: minutosAtras(7), content: 'Pendente', contact_id: 'c1' },
      { id: 'm7', sender: 'contact', status: 'failed', created_at: minutosAtras(2), content: 'Resposta do cliente', contact_id: 'c1' },
      { id: 'm8', sender: 'agent', status: 'failed', created_at: minutosAtras(25 * 60), content: 'Falha de ontem', contact_id: 'c1' },
    ],
    contacts: [
      { id: 'c1', name: 'Ana', whatsapp_connection_id: 'cn-1' },
      { id: 'c2', name: 'Bruno', whatsapp_connection_id: 'cn-1' },
      { id: 'c3', name: 'Carla', whatsapp_connection_id: null },
      { id: 'c4', name: 'Diego', whatsapp_connection_id: null },
    ],
  };

  mocks.from.mockImplementation((table: string) => {
    const consulta: Consulta = {
      table,
      select: null,
      head: false,
      count: null,
      filters: [],
      order: null,
      limit: null,
    };
    mocks.consultas.push(consulta);

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (typeof cols === 'string') consulta.select = cols;
      if (opts?.count) consulta.count = opts.count;
      if (opts?.head) consulta.head = true;
      return builder;
    });
    builder.eq = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['eq', col, val]);
      return builder;
    });
    builder.neq = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['neq', col, val]);
      return builder;
    });
    builder.gte = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['gte', col, val]);
      return builder;
    });
    builder.lt = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['lt', col, val]);
      return builder;
    });
    builder.is = vi.fn((col: string, val: unknown) => {
      consulta.filters.push(['is', col, val]);
      return builder;
    });
    builder.in = vi.fn((col: string, vals: unknown[]) => {
      consulta.filters.push(['in', col, vals]);
      return builder;
    });
    builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      consulta.order = { column: col, ascending: opts?.ascending !== false };
      return builder;
    });
    builder.limit = vi.fn((n: number) => {
      consulta.limit = n;
      return builder;
    });
    builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rodar(consulta)).then(res, rej);
    return builder;
  });

  vi.spyOn(performance, 'now').mockImplementation(() => mocks.relogio);
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  const utils = renderHook(() => useDiagnosticsData());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return utils;
}

describe('useDiagnosticsData — mensagens da janela de 24 h', () => {
  it('conta só as mensagens do agente dentro da janela e calcula as taxas', async () => {
    const { result } = await montar();

    expect(result.current.loading).toBe(false);
    // Fixture: 6 mensagens do agente na janela (m1..m6) — m7 é do contato e
    // m8 tem 25 h, as duas ficam de fora.
    expect(result.current.messageDiag).toEqual({
      total: 6,
      sent: 1,
      delivered: 1,
      read: 1,
      failed: 2,
      pending: 1,
      deliveryRate: 33,
      failureRate: 33,
      recentFailures: [
        { id: 'm4', content: 'Tentativa 1', status: 'failed', created_at: minutosAtras(4), contact_name: 'Desconhecido' },
        { id: 'm5', content: null, status: 'failed', created_at: minutosAtras(6), contact_name: 'Desconhecido' },
        { id: 'm8', content: 'Falha de ontem', status: 'failed', created_at: minutosAtras(25 * 60), contact_name: 'Ana' },
      ],
    });

    // A janela das contagens é exatamente 24 h antes de agora.
    const janela = consultasDe('messages')[0].filters.find((f) => f[0] === 'gte');
    expect(janela).toEqual(['gte', 'created_at', isoMenos(24 * 60 * 60 * 1000)]);
  });

  it('busca o nome só dos contatos citados e sem repetir (dedup + filtro de nulo)', async () => {
    const { result } = await montar();

    const buscaContatos = consultasDe('contacts').find((c) =>
      c.filters.some((f) => f[0] === 'in'),
    );
    // m5 não tem contato e m8 repete c1 — o `in` leva cada id uma vez.
    expect(buscaContatos?.filters).toEqual([['in', 'id', ['c-sem-nome', 'c1']]]);
    expect(result.current.messageDiag?.recentFailures.map((f) => f.contact_name)).toEqual([
      'Desconhecido',
      'Desconhecido',
      'Ana',
    ]);
  });

  it('base vazia: taxas 0 (sem divisão por zero) e nenhuma busca de contato', async () => {
    mocks.tabelas.messages = [];
    const { result } = await montar();

    expect(result.current.messageDiag).toEqual({
      total: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
      deliveryRate: 0,
      failureRate: 0,
      recentFailures: [],
    });
    expect(consultasDe('contacts').some((c) => c.filters.some((f) => f[0] === 'in'))).toBe(false);
  });

  it('sem falhas na leitura a lista de falhas recentes fica vazia', async () => {
    mocks.tabelas.messages = mocks.tabelas.messages.filter((m) => m.status !== 'failed');
    const { result } = await montar();

    expect(result.current.messageDiag?.recentFailures).toEqual([]);
    expect(result.current.messageDiag?.failureRate).toBe(0);
  });
});

describe('useDiagnosticsData — saúde do sistema (classificação por latência)', () => {
  it('coleta rápida e com ack fica saudável, com as latências medidas', async () => {
    mocks.bumpDb = 120;
    mocks.bumpStorage = 200;
    const { result } = await montar();

    expect(result.current.health).toMatchObject({
      database: 'healthy',
      storage: 'healthy',
      realtime: 'healthy',
      edgeFunctions: 'healthy',
      dbLatency: 120,
      storageLatency: 200,
    });
    expect(result.current.health?.realtimeCheckedAt).toBe(AGORA);
    expect(result.current.health?.contactsCount).toBe(4);
    expect(result.current.health?.messagesCount).toBe(8);
    expect(result.current.health?.connectionsCount).toBe(2);
    expect(mocks.canaisRemovidos).toHaveLength(1);
    expect(mocks.storageChamadas).toEqual([
      { bucket: 'whatsapp-media', path: '', limit: 1 },
    ]);
  });

  it('base lenta (700 ms) degrada; acima de 2 s fica fora do ar', async () => {
    mocks.bumpDb = 700;
    const lento = await montar();
    expect(lento.result.current.health).toMatchObject({ database: 'degraded', dbLatency: 700 });

    mocks.bumpDb = 2500;
    const parado = await montar();
    expect(parado.result.current.health).toMatchObject({ database: 'down', dbLatency: 2500 });
  });

  it('limite exato conta como o pior lado (< 500 saudável; 500 já degrada)', async () => {
    mocks.bumpDb = 499;
    const quase = await montar();
    expect(quase.result.current.health?.database).toBe('healthy');

    mocks.bumpDb = 500;
    const limite = await montar();
    expect(limite.result.current.health?.database).toBe('degraded');
  });

  it('storage lento degrada e acima de 3 s fica fora do ar', async () => {
    mocks.bumpStorage = 1500;
    const lento = await montar();
    expect(lento.result.current.health).toMatchObject({ storage: 'degraded', storageLatency: 1500 });

    mocks.bumpStorage = 3000;
    const parado = await montar();
    expect(parado.result.current.health).toMatchObject({ storage: 'down', storageLatency: 3000 });
  });

  it('erro rápido do banco é "down" com latência nula (não vira saudável)', async () => {
    mocks.errosTabela = [
      { table: 'contacts', filtro: ehProbeDb, error: { code: '57014', message: 'query cancelada' } },
    ];
    const { result } = await montar();

    expect(result.current.health).toMatchObject({ database: 'down', dbLatency: null });
  });

  it('falha de transporte (consulta que lança) também é "down", sem latência', async () => {
    mocks.errosTabela = [
      { table: 'contacts', filtro: ehProbeDb, throw: new Error('Failed to fetch') },
    ];
    const { result } = await montar();

    expect(result.current.health).toMatchObject({ database: 'down', dbLatency: null });
    // O resto da coleta continua de pé.
    expect(result.current.health?.storage).toBe('healthy');
    expect(result.current.health?.contactsCount).toBe(0);
  });

  it('RLS no banco vira "unauthorized" — códigos 401/403/42501/PGRST301', async () => {
    for (const code of ['401', '403', '42501', 'PGRST301']) {
      mocks.errosTabela = [{ table: 'contacts', filtro: ehProbeDb, error: { code } }];
      const { result } = await montar();
      expect(result.current.health?.database).toBe('unauthorized');
    }
  });

  it('erro de autorização sem código, só pela mensagem, também é "unauthorized"', async () => {
    mocks.errosTabela = [
      {
        table: 'contacts',
        filtro: ehProbeDb,
        error: { message: 'permission denied for table contacts' },
      },
    ];
    const { result } = await montar();
    expect(result.current.health?.database).toBe('unauthorized');
  });

  it('erro de autorização no storage também é distinguido da queda', async () => {
    mocks.erroStorage = { code: '42501', message: 'permission denied' };
    const { result } = await montar();

    expect(result.current.health).toMatchObject({ storage: 'unauthorized', storageLatency: null });
    expect(result.current.health?.database).toBe('healthy');
  });

  it('exceção no storage (não erro do PostgREST) derruba só o storage', async () => {
    mocks.throwStorage = new Error('NetworkError');
    const { result } = await montar();

    expect(result.current.health).toMatchObject({ storage: 'down', storageLatency: null });
    expect(result.current.health?.database).toBe('healthy');
  });
});

describe('useDiagnosticsData — realtime (ack do canal)', () => {
  it('ack SUBSCRIBED é saudável e o canal é sempre devolvido', async () => {
    const { result } = await montar();
    expect(result.current.health?.realtime).toBe('healthy');
    expect(result.current.health?.realtimeCheckedAt).toBe(AGORA);
    expect(mocks.canaisRemovidos).toHaveLength(1);
  });

  it('CHANNEL_ERROR e TIMED_OUT derrubam o realtime, sem instante de checagem', async () => {
    mocks.canalComportamento = 'error';
    const caiu = await montar();
    expect(caiu.result.current.health).toMatchObject({ realtime: 'down', realtimeCheckedAt: null });

    mocks.canalComportamento = 'timedout';
    const estourou = await montar();
    expect(estourou.result.current.health).toMatchObject({
      realtime: 'down',
      realtimeCheckedAt: null,
    });
  });

  it('canal fechado fica "unknown" (não medido), nunca saudável', async () => {
    mocks.canalComportamento = 'closed';
    const { result } = await montar();

    expect(result.current.health).toMatchObject({ realtime: 'unknown', realtimeCheckedAt: null });
  });

  it('canal que nem abre (exceção) fica "unknown" e não tenta remover nada', async () => {
    mocks.canalComportamento = 'throw';
    const { result } = await montar();

    expect(result.current.health).toMatchObject({ realtime: 'unknown', realtimeCheckedAt: null });
    expect(mocks.canaisRemovidos).toHaveLength(0);
  });

  it('sem ack dentro de 5 s o realtime fica "unknown" e o canal é limpo', async () => {
    mocks.canalComportamento = 'silent';
    const { result } = await montar();
    expect(result.current.health?.realtime).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.health).toMatchObject({ realtime: 'unknown', realtimeCheckedAt: null });
    expect(result.current.loading).toBe(false);
    expect(mocks.canaisRemovidos).toHaveLength(1);
  });
});

describe('useDiagnosticsData — edge functions', () => {
  it('invoke que responde com erro degrada as edge functions', async () => {
    mocks.fnResultado = { data: null, error: { message: 'sem resposta' } };
    const { result } = await montar();
    expect(result.current.health?.edgeFunctions).toBe('degraded');
  });

  it('invoke que lança também degrada, sem derrubar o resto da coleta', async () => {
    mocks.fnLanca = true;
    const { result } = await montar();
    expect(result.current.health).toMatchObject({ edgeFunctions: 'degraded', database: 'healthy' });
  });
});

describe('useDiagnosticsData — conexões e logs de erro', () => {
  it('lista as conexões da mais nova para a mais antiga', async () => {
    const { result } = await montar();

    expect(result.current.connections.map((c) => c.id)).toEqual(['cn-2', 'cn-1']);
    expect(result.current.connectedCount).toBe(1);
    const conexoes = consultasDe('whatsapp_connections')[0];
    expect(conexoes.order).toEqual({ column: 'created_at', ascending: false });
  });

  it('monta os quatro tipos de log e ordena do mais novo para o mais antigo', async () => {
    const { result } = await montar();
    const logs = result.current.errorLogs;

    // Relação da fixture: mensagens falhas m4(4'), m5(6'), m7(2'), m8(25h);
    // conexão desconectada cn-2 (updated_at 20'); 2 contatos órfãos e 1
    // mensagem travada (m6, 7 min em "sending"), ambos com o INSTANTE da
    // contagem — por isso aparecem antes das falhas mais novas.
    expect(logs.map((l) => l.id)).toEqual([
      'orphan-contacts',
      'stuck-messages',
      'msg-m7',
      'msg-m4',
      'msg-m5',
      'conn-cn-2',
      'msg-m8',
    ]);
    expect(logs.map((l) => l.severity)).toEqual([
      'warning',
      'warning',
      'error',
      'error',
      'error',
      'critical',
      'error',
    ]);
    expect(logs.map((l) => l.type)).toEqual([
      'system',
      'message',
      'message',
      'message',
      'message',
      'connection',
      'message',
    ]);
    // errorCount soma 'error' + 'critical' (4 mensagens falhas + 1 conexão caída).
    expect(result.current.errorCount).toBe(5);
    expect(result.current.warningCount).toBe(2);
  });

  it('conteúdo nulo na mensagem falha não quebra o detalhe do log', async () => {
    const { result } = await montar();
    const semConteudo = result.current.errorLogs.find((l) => l.id === 'msg-m5');

    expect(semConteudo?.details).toBe('Mensagem "undefined..." falhou ao enviar');
    expect(semConteudo?.message).toBe('Falha no envio de mensagem');
  });

  it('trunca o conteúdo do log em 50 caracteres', async () => {
    const longo = 'x'.repeat(80);
    mocks.tabelas.messages = [
      { id: 'm9', sender: 'agent', status: 'failed', created_at: minutosAtras(1), content: longo, contact_id: 'c1' },
    ];
    const { result } = await montar();
    const semConteudo = result.current.errorLogs.find((l) => l.id === 'msg-m9');

    expect(semConteudo?.details).toBe(`Mensagem "${'x'.repeat(50)}..." falhou ao enviar`);
  });

  it('sem nenhum problema não gera log e a contagem de conexões fica 0', async () => {
    mocks.tabelas.whatsapp_connections = [
      {
        id: 'cn-9',
        instance_id: 'inst-ok',
        status: 'connected',
        phone_number: null,
        created_at: minutosAtras(10),
        updated_at: minutosAtras(9),
      },
    ];
    mocks.tabelas.messages = [];
    mocks.tabelas.contacts = [
      { id: 'c1', name: 'Ana', whatsapp_connection_id: 'cn-9' },
    ];
    const { result } = await montar();

    expect(result.current.errorLogs).toEqual([]);
    expect(result.current.errorCount).toBe(0);
    expect(result.current.warningCount).toBe(0);
    expect(result.current.connectedCount).toBe(1);
  });

  it('a consulta de travadas usa a marca de 5 minutos', async () => {
    const { result } = await montar();

    const travadas = consultasDe('messages').find((c) =>
      c.filters.some((f) => f[0] === 'lt'),
    );
    expect(travadas?.filters).toEqual([
      ['eq', 'status', 'sending'],
      ['lt', 'created_at', isoMenos(5 * 60 * 1000)],
    ]);
    expect(result.current.errorLogs.some((l) => l.id === 'stuck-messages')).toBe(true);
  });

  it('órfãos: uma única linha de aviso com a contagem', async () => {
    const { result } = await montar();
    const orfaos = result.current.errorLogs.find((l) => l.id === 'orphan-contacts');

    expect(orfaos?.message).toBe('2 contato(s) sem conexão WhatsApp');
    expect(orfaos?.severity).toBe('warning');
  });
});

describe('useDiagnosticsData — atualização', () => {
  it('handleRefresh avisa o início, refaz tudo e avisa o fim', async () => {
    const { result } = await montar();
    const consultasAntes = mocks.consultas.length;

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mocks.toastInfo).toHaveBeenCalledWith('Atualizando diagnósticos...');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Diagnósticos atualizados!');
    expect(mocks.consultas.length).toBeGreaterThan(consultasAntes);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('o intervalo de 30 s refaz a coleta sozinho e renova lastRefresh', async () => {
    const { result } = await montar();
    const consultasAntes = mocks.consultas.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mocks.consultas.length).toBe(consultasAntes * 2);
    expect(result.current.lastRefresh.toISOString()).toBe('2026-10-07T12:00:30.000Z');
  });

  it('desmontar cancela o intervalo (nenhuma consulta depois)', async () => {
    const { unmount } = await montar();
    const consultasAntes = mocks.consultas.length;

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mocks.consultas.length).toBe(consultasAntes);
  });
});

describe('useDiagnosticsData — defeitos encontrados (não corrigidos neste cartão)', () => {
  // BUG: as contagens de `messages` ignoram o `error` da resposta. Uma leitura
  // barrada por RLS devolve `error` (não exceção) e `count` indefinido, então
  // o hook publica zeros: "0 mensagens, 0% de falha" — o operador lê o painel
  // como sistema saudável justamente quando a coleta foi negada (o mesmo
  // arquivo trata autorização direitinho na saúde do banco).
  it.fails('leitura de messages negada por RLS não deveria virar zeros silenciosos', async () => {
    mocks.errosTabela = [
      {
        table: 'messages',
        filtro: (c) => c.head,
        error: { code: '42501', message: 'permission denied for table messages' },
      },
    ];
    const { result } = await montar();

    // Comportamento correto: não publicar um agregado que finge sucesso.
    expect(result.current.messageDiag).toBeNull();
  });
});
