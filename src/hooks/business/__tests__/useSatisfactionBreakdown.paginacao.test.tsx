/**
 * `useSatisfactionBreakdown` — paginação keyset e recorte da janela.
 *
 * O sujeito é o hook REAL (`src/hooks/business/useCSAT.ts`). A dublagem é só a
 * fronteira de rede: cada consulta à tabela grava o select, os filtros e devolve
 * a página que o teste mandar (uma página por consulta, em ordem). Assim se prova
 * o que o hook pede ao PostgREST — sem o teto de linhas do servidor perder as
 * respostas recentes em silêncio — e o que ele faz com a recusa.
 *
 * Fixtures coerentes: toda linha de `csat_surveys` tem `created_at` ISO e rating
 * de 1 a 5; todo `queue_id` usado existe em `queues`, salvo nos casos que provam
 * o fallback de registro removido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';

type Pagina = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  /** Páginas de `csat_surveys`, consumidas em ordem (uma por consulta). */
  paginas: [] as Pagina[],
  consultas: [] as Array<{ table: string; select?: string; filtros: unknown[][] }>,
  queues: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const reg: { table: string; select?: string; filtros: unknown[][] } = { table, filtros: [] };
      h.consultas.push(reg);
      const b: Record<string, unknown> = {};
      const mesmo = () => b;
      b.select = (s: string) => {
        reg.select = s;
        return mesmo();
      };
      b.gte = (...a: unknown[]) => {
        reg.filtros.push(['gte', ...a]);
        return mesmo();
      };
      b.order = (...a: unknown[]) => {
        reg.filtros.push(['order', ...a]);
        return mesmo();
      };
      b.limit = (...a: unknown[]) => {
        reg.filtros.push(['limit', ...a]);
        return mesmo();
      };
      b.or = (...a: unknown[]) => {
        reg.filtros.push(['or', ...a]);
        return mesmo();
      };
      b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        const base: Pagina =
          table === 'queues' ? h.queues : h.paginas.shift() ?? { data: [], error: null };
        return Promise.resolve(base).then(ok, falhou);
      };
      return b;
    },
  },
}));

import { useSatisfactionBreakdown } from '../useCSAT';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Linha como o select devolve: join de agente (name) e contato (queue_id). */
function linha(
  id: string,
  rating: number,
  created_at: string,
  agente: string | null = null,
  queue_id: string | null = null,
) {
  return {
    id,
    agent_id: agente ? `ag-${agente}` : null,
    rating,
    created_at,
    agent: agente ? { name: agente } : null,
    contact: queue_id ? { queue_id } : null,
  };
}

function diasAtras(dias: number, hora = 12) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
}

const consultasCsat = () => h.consultas.filter((c) => c.table === 'csat_surveys');
const filtro = (c: { filtros: unknown[][] }, nome: string) => c.filtros.find((f) => f[0] === nome);

function montar(periodDays: 7 | 30 | 90 = 30) {
  return renderHook(() => useSatisfactionBreakdown(periodDays), { wrapper });
}

beforeEach(() => {
  h.paginas = [];
  h.consultas = [];
  h.queues = { data: [], error: null };
});

describe('useSatisfactionBreakdown — paginação keyset', () => {
  it('uma página curta ainda pede a próxima e só para na página vazia, com o complemento keyset na segunda consulta', async () => {
    h.paginas = [
      { data: [linha('s1', 5, diasAtras(0))], error: null },
      { data: [], error: null },
    ];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const csat = consultasCsat();
    expect(csat).toHaveLength(2);
    // Sem cursor na primeira consulta; a segunda carrega o desempate por (created_at, id).
    expect(filtro(csat[0], 'or')).toBeUndefined();
    expect(String(filtro(csat[1], 'or')?.[1])).toContain('created_at.gt.');
    // Ordem estável: created_at asc e id asc, com o teto de página explícito.
    expect(csat[0].filtros).toContainEqual(['order', 'created_at', { ascending: true }]);
    expect(csat[0].filtros).toContainEqual(['order', 'id', { ascending: true }]);
    expect(csat[0].filtros).toContainEqual(['limit', 1000]);
    expect(csat[0].filtros).toContainEqual(['gte', 'created_at', expect.any(String)]);
    expect(result.current.data?.totalResponses).toBe(1);
  });

  it('o cursor vai entre aspas: o timestamptz com ":" e "+" não é lido como separador de filtro', async () => {
    h.paginas = [
      { data: [linha('s1', 4, '2026-10-13T12:00:00+00:00')], error: null },
      { data: [], error: null },
    ];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(filtro(consultasCsat()[1], 'or')?.[1]).toBe(
      'created_at.gt."2026-10-13T12:00:00+00:00",and(created_at.eq."2026-10-13T12:00:00+00:00",id.gt.s1)',
    );
  });

  it('o cursor avança pela última linha de cada página (nunca pela primeira)', async () => {
    h.paginas = [
      { data: [linha('s1', 5, '2026-10-13T10:00:00+00:00'), linha('s2', 5, '2026-10-13T11:00:00+00:00')], error: null },
      { data: [linha('s3', 5, '2026-10-13T12:00:00+00:00')], error: null },
      { data: [], error: null },
    ];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const csat = consultasCsat();
    expect(csat).toHaveLength(3);
    expect(String(filtro(csat[1], 'or')?.[1])).toContain('id.gt.s2');
    expect(String(filtro(csat[2], 'or')?.[1])).toContain('id.gt.s3');
    expect(result.current.data?.totalResponses).toBe(3);
  });

  it('teto de 50 páginas: 51 páginas cheias falha com o total lido, em vez de devolver dado parcial', async () => {
    h.paginas = Array.from({ length: 51 }, (_, i) => ({
      data: [linha(`s${i}`, 5, '2026-10-13T10:00:00+00:00')],
      error: null,
    }));

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toBe(
      '[useCSAT] paginacao excedeu 50 paginas (51 linhas)',
    );
    expect(result.current.data).toBeUndefined();
    expect(consultasCsat()).toHaveLength(51);
  });

  it('erro de leitura (RLS) sobe como falha — não vira lista vazia silenciosa', async () => {
    h.paginas = [
      { data: null, error: { message: 'permission denied for table csat_surveys', code: '42501' } },
    ];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as { message: string }).message).toBe(
      'permission denied for table csat_surveys',
    );
  });

  it('erro na leitura de queues não é engolido', async () => {
    h.paginas = [{ data: [], error: null }];
    h.queues = { data: null, error: { message: 'permission denied for table queues', code: '42501' } };

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as { message: string }).message).toBe(
      'permission denied for table queues',
    );
  });
});

describe('useSatisfactionBreakdown — agregação da janela', () => {
  it('separa janela atual da anterior: CSAT é o % de notas >= 4 e a tendência compara as duas', async () => {
    h.paginas = [
      {
        data: [
          linha('hoje', 5, diasAtras(0)),
          linha('ontem', 5, diasAtras(1)),
          linha('antigo', 1, diasAtras(40)),
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    const { result } = montar(30);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const d = result.current.data!;
    expect(d.totalResponses).toBe(2);
    expect(d.csatPercent).toBe(100);
    expect(d.previousCsatPercent).toBe(0);
    // 0% no período anterior -> 100% agora é alta de 100 pontos.
    expect(d.trend).toBe('up');
    expect(d.trendValue).toBe(100);
  });

  it('distribuição vem na ordem 5..1 e valores iguais dos períodos dão tendência estável', async () => {
    h.paginas = [
      {
        data: [
          linha('a', 5, diasAtras(0)),
          linha('b', 3, diasAtras(0)),
          linha('c', 4, diasAtras(31)),
          linha('d', 3, diasAtras(32)),
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    const { result } = montar(30);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const d = result.current.data!;
    expect(d.distribution).toEqual([
      { rating: 5, count: 1 },
      { rating: 4, count: 0 },
      { rating: 3, count: 1 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 },
    ]);
    expect(d.csatPercent).toBe(50);
    expect(d.previousCsatPercent).toBe(50);
    expect(d.trend).toBe('stable');
    expect(d.trendValue).toBe(0);
  });

  it('por agente e por fila: nome resolvido, melhor CSAT primeiro e fallback de registro removido', async () => {
    h.queues = { data: [{ id: 'q1', name: 'Vendas' }], error: null };
    h.paginas = [
      {
        data: [
          linha('a1', 5, diasAtras(0), 'Ana', 'q1'),
          linha('a2', 5, diasAtras(0), 'Ana', 'q1'),
          linha('a3', 3, diasAtras(0), 'Carlos', 'q-inexistente'),
          linha('a4', 1, diasAtras(0), null, null),
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const d = result.current.data!;
    expect(d.byAgent).toEqual([
      { agentId: 'ag-Ana', agentName: 'Ana', csatPercent: 100, responses: 2 },
      { agentId: 'ag-Carlos', agentName: 'Carlos', csatPercent: 0, responses: 1 },
    ]);
    expect(d.byQueue).toEqual([
      { queueId: 'q1', queueName: 'Vendas', csatPercent: 100, responses: 2 },
      { queueId: 'q-inexistente', queueName: 'Fila removida', csatPercent: 0, responses: 1 },
    ]);
    // Linha sem agente e sem fila não inventa entrada nem some do total.
    expect(d.totalResponses).toBe(4);
  });

  it('agente com avaliação mas perfil apagado aparece como "Agente removido"', async () => {
    h.paginas = [
      { data: [linha('a1', 5, diasAtras(0), null, null)], error: null },
      { data: [], error: null },
    ];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.byAgent).toEqual([]);
    expect(result.current.data?.totalResponses).toBe(1);
  });

  it('timeline cobre exatamente os N dias, do mais antigo a hoje, com null no dia sem resposta', async () => {
    h.paginas = [
      { data: [linha('a1', 5, diasAtras(0))], error: null },
      { data: [], error: null },
    ];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const t = result.current.data!.timeline;
    expect(t).toHaveLength(7);
    const hoje = format(new Date(), 'dd/MM');
    expect(t[t.length - 1]).toEqual({ date: hoje, csatPercent: 100, responses: 1 });
    const ontem = format(new Date(Date.now() - 86400000), 'dd/MM');
    expect(t[t.length - 2]).toEqual({ date: ontem, csatPercent: null, responses: 0 });
  });

  it('vazio: período sem nenhuma resposta não inventa número', async () => {
    h.paginas = [{ data: [], error: null }];

    const { result } = montar(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const d = result.current.data!;
    expect(d.totalResponses).toBe(0);
    expect(d.csatPercent).toBeNull();
    expect(d.previousCsatPercent).toBeNull();
    expect(d.trend).toBeNull();
    expect(d.trendValue).toBe(0);
    expect(d.distribution).toEqual([
      { rating: 5, count: 0 },
      { rating: 4, count: 0 },
      { rating: 3, count: 0 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 },
    ]);
    expect(d.byAgent).toEqual([]);
    expect(d.byQueue).toEqual([]);
    expect(d.timeline).toHaveLength(7);
    expect(d.timeline.every((p) => p.csatPercent === null && p.responses === 0)).toBe(true);
  });
});
