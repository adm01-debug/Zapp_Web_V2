import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: import("react").ReactNode }) => children,
}));

import { useAgentGamification, ACHIEVEMENT_TYPES, ACHIEVEMENTS_PAGE_SIZE } from '@/hooks/gamification/useAgentGamification';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

/** 25 conquistas: acima da página de 20 — o caso do cartão (o corte antigo mentia). */
const CONQUISTAS = Array.from({ length: 25 }, (_, i) => ({
  id: `a${i + 1}`,
  profile_id: 'p1',
  achievement_type: 'fast_response',
  achievement_name: `Fast ${i + 1}`,
  achievement_description: null,
  xp_earned: 50,
  earned_at: '2024-01-01',
}));

let rangesLidos: Array<[number, number]> = [];
let ordensLidas: Array<[string, boolean]> = [];
let contagemNoServidor = CONQUISTAS.length;

/** Builder thenable do PostgREST: select → eq → order ×2 → range. */
function achievementsBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = (coluna: string, opcoes?: { ascending?: boolean }) => {
    ordensLidas.push([coluna, opcoes?.ascending ?? true]);
    return builder;
  };
  builder.range = (from: number, to: number) => {
    rangesLidos.push([from, to]);
    return Promise.resolve({ data: CONQUISTAS.slice(from, to + 1), error: null });
  };
  builder.insert = () => Promise.resolve({ error: null });
  return builder;
}

describe('useAgentGamification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rangesLidos = [];
    ordensLidas = [];
    contagemNoServidor = CONQUISTAS.length;
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'agent_stats') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 's1', profile_id: 'p1', xp: 500, level: 3, current_streak: 5, best_streak: 10, messages_sent: 100, conversations_resolved: 20, achievements_count: contagemNoServidor },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'agent_achievements') return achievementsBuilder();
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('initializes without error', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('returns null stats when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('fetches achievements list', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.achievements).toBeDefined();
  });

  it('página de conquistas: lê 20 primeiro e o resto sob demanda, com o total do servidor', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Primeira página: o corte antigo vinha de `.limit(20)` sem total nenhum.
    expect(ACHIEVEMENTS_PAGE_SIZE).toBe(20);
    expect(rangesLidos).toEqual([[0, 19]]);
    expect(result.current.achievements).toHaveLength(20);
    // O total exibido é o do servidor (agent_stats.achievements_count = 25), não o da página.
    expect(result.current.achievementsTotal).toBe(25);
    expect(result.current.hasMore).toBe(true);

    act(() => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.achievements).toHaveLength(25));

    // Segunda página pedida na sequência e ninguém repetido nas duas.
    expect(rangesLidos).toEqual([[0, 19], [20, 39]]);
    expect(new Set(result.current.achievements.map(a => a.id)).size).toBe(25);
    expect(result.current.achievementsTotal).toBe(25);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('ordena com desempate determinístico (earned_at e id) para a paginação por range', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(ordensLidas).toEqual([['earned_at', false], ['id', false]]);
  });

  it('clique repetido em "ver mais" não dispara uma segunda busca da mesma página', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.achievements).toHaveLength(25));

    // Uma página a mais depois da primeira — não duas.
    expect(rangesLidos).toEqual([[0, 19], [20, 39]]);
  });

  it('com stats defasadas, o total nunca é menor do que a lista já carregada', async () => {
    contagemNoServidor = 20;
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.achievements).toHaveLength(20);
    expect(result.current.achievementsTotal).toBe(20);
  });

  it('ACHIEVEMENT_TYPES contains required types', () => {
    expect(ACHIEVEMENT_TYPES.FAST_RESPONSE).toBe('fast_response');
    expect(ACHIEVEMENT_TYPES.STREAK).toBe('streak');
    expect(ACHIEVEMENT_TYPES.RESOLUTION).toBe('resolution');
    expect(ACHIEVEMENT_TYPES.PERFECT_RATING).toBe('perfect_rating');
    expect(ACHIEVEMENT_TYPES.LEVEL_UP).toBe('level_up');
    expect(ACHIEVEMENT_TYPES.FIRST_MESSAGE).toBe('first_message');
  });

  it('all achievement type values are unique', () => {
    const values = Object.values(ACHIEVEMENT_TYPES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('não expõe mutações de escrita (XP, conquista, sequência, mensagens, resoluções)', async () => {
    const { result } = renderHook(() => useAgentGamification(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const escrita of ['addXp', 'grantAchievement', 'updateStreak', 'incrementMessages', 'incrementResolutions']) {
      expect(result.current).not.toHaveProperty(escrita);
    }
  });
});
