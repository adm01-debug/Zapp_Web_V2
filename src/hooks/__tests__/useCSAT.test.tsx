import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Resposta = { data: unknown; error: unknown };

// O stub de PostgREST devolve as respostas na ordem das chamadas (uma por
// pagina lida). `orUsados`/`limites` registram a paginacao keyset usada.
const h = vi.hoisted(() => ({
  fila: [] as Array<{ data: unknown; error: unknown } | Promise<never>>,
  orUsados: 0,
  limites: [] as number[],
}));

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useCSAT } from '@/hooks/business/useCSAT';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function criarBuilder(proxima: () => Resposta | Promise<never>) {
  let resolvida: Resposta | Promise<never> | null = null;
  const resposta = () => (resolvida ??= proxima());
  const b: Record<string, unknown> = {
    select: () => b,
    gte: () => b,
    eq: () => b,
    order: () => b,
    or: () => {
      h.orUsados += 1;
      return b;
    },
    limit: (n: number) => {
      h.limites.push(n);
      return b;
    },
    insert: () => Promise.resolve({ error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve(resposta()).then(res),
  };
  return b;
}

function avaliacao(id: string, rating: number, created_at: string) {
  return { id, contact_id: `c-${id}`, agent_id: 'a1', rating, feedback: null, conversation_resolved_at: null, created_at };
}

const diasAtras = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

const mockSurveys = [
  avaliacao('s1', 5, diasAtras(1)),
  avaliacao('s2', 3, diasAtras(2)),
  avaliacao('s3', 1, diasAtras(3)),
];

describe('useCSAT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.fila = [];
    h.orUsados = 0;
    h.limites = [];
    mockFrom.mockImplementation(() => criarBuilder(() => h.fila.shift() ?? { data: [], error: null }));
  });

  it('fetches CSAT surveys', async () => {
    h.fila = [{ data: mockSurveys, error: null }];
    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.surveys).toHaveLength(3);
    expect(result.current.stats?.total).toBe(3);
  });

  it('handles loading state', () => {
    h.fila = [new Promise<never>(() => {})];
    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('handles empty surveys', async () => {
    h.fila = [{ data: [], error: null }];

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.surveys).toEqual([]);
  });

  // CSAT-ERRO-ZERO: falha de leitura nao pode sair daqui como "0 avaliacoes".
  it('erro na leitura expoe o erro (nao vira zero silencioso)', async () => {
    h.fila = [{ data: null, error: { message: 'permission denied', code: '42501' } }];

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('permission denied');
    expect(typeof result.current.refetch).toBe('function');
  });

  it('refetch apos erro traz os dados (caminho do "Tentar de novo")', async () => {
    h.fila = [{ data: null, error: { message: 'timeout' } }, { data: mockSurveys, error: null }];

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.surveys).toHaveLength(3));
    expect(result.current.isError).toBe(false);
  });

  // PostgREST corta a resposta no teto de linhas do projeto: sem paginar, o
  // total/media sairiam de uma amostra silenciosa das linhas mais antigas.
  it('pagina a leitura quando a janela passa do teto de linhas', async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => avaliacao(`p1-${i}`, 5, diasAtras(1)));
    const pagina2 = Array.from({ length: 500 }, (_, i) => avaliacao(`p2-${i}`, 3, diasAtras(1)));
    h.fila = [{ data: pagina1, error: null }, { data: pagina2, error: null }, { data: [], error: null }];

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.surveys).toHaveLength(1500));
    expect(result.current.stats?.total).toBe(1500);
    expect(h.limites).toContain(1000);
    // Chave de paginacao usada nas paginas 2 e 3 (a 1 nao tem cursor).
    expect(h.orUsados).toBe(2);
  });

  it('a tendencia compara a media da janela atual com a anterior', async () => {
    h.fila = [
      {
        data: [
          avaliacao('cur1', 5, diasAtras(1)),
          avaliacao('cur2', 5, diasAtras(2)),
          avaliacao('prev1', 4, diasAtras(40)),
          avaliacao('prev2', 4, diasAtras(41)),
        ],
        error: null,
      },
    ];

    const { result } = renderHook(() => useCSAT('month'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.stats?.total).toBe(2));
    expect(result.current.stats?.average).toBeCloseTo(5);
    // (5 - 4) / 4 = +25%
    expect(result.current.stats?.trend).toBe(25);
  });

  // R2-MOD-028: as estatisticas nao podem ficar no snapshot anterior quando a
  // releitura das avaliacoes chega depois da invalidacao pos-submissao.
  it('atualiza media, total e distribuicao junto com a lista apos nova submissao', async () => {
    const initial = mockSurveys;
    const updated = [...initial, avaliacao('s4', 4, diasAtras(1))];

    h.fila = [
      { data: initial, error: null },
      { data: [], error: null },
      { data: updated, error: null },
      { data: [], error: null },
    ];

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.surveys).toHaveLength(3));
    await waitFor(() => expect(result.current.stats?.total).toBe(3));
    expect(result.current.stats?.average).toBeCloseTo(3);

    act(() => {
      result.current.submitSurvey.mutate({ contact_id: 'c4', rating: 4 });
    });

    await waitFor(() => expect(result.current.surveys).toHaveLength(4));
    expect(result.current.stats?.total).toBe(4);
    expect(result.current.stats?.average).toBeCloseTo(13 / 4);
    expect(result.current.stats?.distribution[4]).toBe(1);
  });
});
