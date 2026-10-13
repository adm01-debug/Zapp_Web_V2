/**
 * `useNPSSurveys` — leitura, estado vazio/erro e registro de pesquisa.
 *
 * O sujeito é o hook REAL (`src/hooks/business/useNPSSurveys.ts`). A dublagem é
 * só a fronteira de rede: cada `from(tabela)` grava a operação, o payload e os
 * filtros, e devolve o que o teste mandar — inclusive erro de RLS. Assim se prova
 * o que o hook pede ao banco, o que ele faz com a recusa (não derruba a tela) e
 * que a janela vazia não inventa número.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  ops: [] as Array<{
    table: string;
    op: string;
    select?: string;
    payload?: unknown;
    filtros: unknown[][];
    single?: boolean;
  }>,
  /** Páginas de `nps_surveys`, consumidas em ordem (uma por leitura). */
  leituras: [] as Array<{ data: unknown; error: unknown }>,
  perfil: { data: { id: 'prof-1' } as unknown, error: null as unknown },
  usuario: { id: 'user-1' } as { id?: string } | null,
  inserir: { error: null as unknown },
  logs: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: (...a: unknown[]) => h.logs.push(a),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: h.usuario } }) },
    from: (table: string) => {
      const reg: {
        table: string;
        op: string;
        select?: string;
        payload?: unknown;
        filtros: unknown[][];
        single: boolean;
      } = { table, op: 'select', filtros: [], single: false };
      h.ops.push(reg);
      const b: Record<string, unknown> = {};
      const mesmo = () => b;
      b.select = (s: string) => {
        reg.select = s;
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
      b.eq = (...a: unknown[]) => {
        reg.filtros.push(['eq', ...a]);
        return mesmo();
      };
      b.single = () => {
        reg.single = true;
        return mesmo();
      };
      b.insert = (payload: unknown) => {
        reg.op = 'insert';
        reg.payload = payload;
        return mesmo();
      };
      b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        let base: { data: unknown; error: unknown };
        if (reg.op === 'insert') base = { data: null, error: h.inserir.error };
        else if (table === 'profiles') {
          // O banco só devolve perfil para o user_id filtrado; sem usuário logado
          // o filtro vai com '' e não há linha.
          const filtroUserId = reg.filtros.find((f) => f[0] === 'eq' && f[1] === 'user_id')?.[2];
          base =
            h.usuario?.id && filtroUserId === h.usuario.id
              ? h.perfil
              : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
        } else base = h.leituras.shift() ?? { data: [], error: null };
        return Promise.resolve(base).then(ok, falhou);
      };
      return b;
    },
  },
}));

import { useNPSSurveys } from '../useNPSSurveys';
import { toast } from 'sonner';

const toastMock = toast as unknown as { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

const leituras = () => h.ops.filter((o) => o.table === 'nps_surveys' && o.op === 'select');
const inserts = () => h.ops.filter((o) => o.op === 'insert');

function survey(id: string, score: number) {
  return {
    id,
    contact_id: `c-${id}`,
    agent_id: null,
    score,
    feedback: null,
    survey_type: 'manual',
    created_at: '2026-10-13T12:00:00+00:00',
  };
}

beforeEach(() => {
  h.ops = [];
  h.leituras = [];
  h.perfil = { data: { id: 'prof-1' }, error: null };
  h.usuario = { id: 'user-1' };
  h.inserir = { error: null };
  h.logs = [];
  vi.clearAllMocks();
});

async function carregado(result: { current: { isLoading: boolean } }) {
  await waitFor(() => expect(result.current.isLoading).toBe(false));
}

describe('useNPSSurveys — leitura', () => {
  it('pede as 500 pesquisas mais recentes por created_at desc e sai do carregando com lista vazia', async () => {
    h.leituras = [{ data: [], error: null }];

    const { result } = renderHook(() => useNPSSurveys());
    expect(result.current.isLoading).toBe(true);
    await carregado(result);

    expect(leituras()).toHaveLength(1);
    expect(leituras()[0].select).toBe('*');
    expect(leituras()[0].filtros).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(leituras()[0].filtros).toContainEqual(['limit', 500]);
    expect(result.current.surveys).toEqual([]);
    expect(result.current.metrics).toEqual({
      totalResponses: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      npsScore: 0,
      avgScore: 0,
    });
  });

  it('calcula promotores, neutros, detratores, NPS e média (média de 7.5 arredonda para 1 casa)', async () => {
    h.leituras = [
      {
        data: [10, 9, 8, 7, 6, 5].map((n, i) => survey(`s${i}`, n)),
        error: null,
      },
    ];

    const { result } = renderHook(() => useNPSSurveys());
    await carregado(result);

    expect(result.current.metrics).toEqual({
      totalResponses: 6,
      promoters: 2,
      passives: 2,
      detractors: 2,
      npsScore: 0,
      avgScore: 7.5,
    });
  });

  it('NPS 100 quando só há promotores e -100 quando só há detratores', async () => {
    h.leituras = [{ data: [survey('a', 10), survey('b', 9)], error: null }];

    const { result } = renderHook(() => useNPSSurveys());
    await carregado(result);
    expect(result.current.metrics.npsScore).toBe(100);

    h.leituras = [{ data: [survey('c', 4), survey('d', 0)], error: null }];
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.metrics.npsScore).toBe(-100);
  });

  it('erro de leitura (RLS) não derruba a tela: lista vazia, sai do carregando e registra o motivo', async () => {
    h.leituras = [
      { data: null, error: { message: 'permission denied for table nps_surveys', code: '42501' } },
    ];

    const { result } = renderHook(() => useNPSSurveys());
    await carregado(result);

    expect(result.current.surveys).toEqual([]);
    expect(result.current.metrics.totalResponses).toBe(0);
    expect(h.logs).toHaveLength(1);
  });
});

describe('useNPSSurveys — registro de pesquisa', () => {
  it('grava a pesquisa, resolve o agente pelo perfil do usuário logado e recarrega a lista', async () => {
    h.leituras = [
      { data: [], error: null },
      { data: [survey('s1', 9)], error: null },
    ];

    const { result } = renderHook(() => useNPSSurveys());
    await carregado(result);

    await act(async () => {
      await result.current.createSurvey({ contact_id: 'c1', score: 9, feedback: '  ótimo  ' });
    });

    const perfil = h.ops.find((o) => o.table === 'profiles');
    expect(perfil?.filtros).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].payload).toEqual({
      contact_id: 'c1',
      agent_id: 'prof-1',
      score: 9,
      feedback: '  ótimo  ',
      survey_type: 'manual',
    });
    expect(toastMock.success).toHaveBeenCalledWith('Pesquisa NPS registrada!');
    // A recarga releu e a lista na tela passou a trazer a pesquisa gravada.
    expect(leituras()).toHaveLength(2);
    expect(result.current.surveys).toHaveLength(1);
  });

  it('sem usuário logado não inventa agente: agent_id fica nulo', async () => {
    h.usuario = null;
    h.leituras = [{ data: [], error: null }, { data: [], error: null }];

    const { result } = renderHook(() => useNPSSurveys());
    await carregado(result);

    await act(async () => {
      await result.current.createSurvey({ contact_id: 'c1', score: 8 });
    });

    expect(inserts()[0].payload).toEqual({
      contact_id: 'c1',
      agent_id: null,
      score: 8,
      feedback: null,
      survey_type: 'manual',
    });
  });

  it('insert recusado pelo RLS: avisa o usuário, rejeita e não recarrega a lista', async () => {
    h.inserir = { error: { message: 'new row violates row-level security policy' } };
    h.leituras = [{ data: [], error: null }];

    const { result } = renderHook(() => useNPSSurveys());
    await carregado(result);

    await expect(
      act(async () => {
        await result.current.createSurvey({ contact_id: 'c1', score: 5 });
      }),
    ).rejects.toEqual({ message: 'new row violates row-level security policy' });

    expect(toastMock.error).toHaveBeenCalledWith('Erro ao registrar pesquisa NPS');
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(leituras()).toHaveLength(1);
  });
});
