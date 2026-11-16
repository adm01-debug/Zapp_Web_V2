/**
 * Dois defeitos do público estimado da biblioteca de segmentos (resgate 261115):
 *
 * 1. Segmento feito SÓ de condição "em breve" (lead_score/risk_score): o
 *    splitRules descarta todas, `complete` vira {groups: []} — que para o
 *    countAudience significa "toda a base" — e a tela mostrava a base inteira
 *    como se fosse o público do segmento. Condição em branco (digitação em
 *    curso) continua mantendo a contagem anterior, de propósito (X008).
 * 2. Botão "Atualizar" da biblioteca: `Promise.all` abortava no primeiro
 *    segmento que falhasse, os demais não eram recalculados, o erro do update
 *    era ignorado e ninguém era avisado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  /** Ids cujo UPDATE deve falhar (simula RLS/rede num segmento só). */
  updateFalhaEm: new Set<string>(),
}));

const toastSpy = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastSpy }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (_name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push(args);
      return Promise.resolve({
        data: args.p_mode === 'page' ? { mode: 'page', rows: [], has_more: false, next_after: null } : { mode: 'count', eligible: 777 },
        error: null,
      });
    },
  },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    select: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => {
        state.updates.push({ id, ...patch });
        return Promise.resolve({ data: null, error: state.updateFalhaEm.has(id) ? { message: 'permissão negada' } : null });
      },
    }),
  }),
}));

import { useAudienceEstimate, useTalkXSegments, splitRules, type SegmentRule, type SegmentRules, type TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const regra = (id: string, field: SegmentRule['field'], value: string): SegmentRule => ({ id, field, op: 'gt', value });
const soEmBreve: SegmentRules = { groups: [{ id: 'g1', match: 'and', rules: [regra('r1', 'lead_score', '50')] }] };
const emBrancoSo: SegmentRules = { groups: [{ id: 'g1', match: 'and', rules: [{ id: 'r1', field: 'city', op: 'eq', value: '' }] }] };
const comCompleta: SegmentRules = {
  groups: [{ id: 'g1', match: 'and', rules: [regra('r1', 'lead_score', '50'), { id: 'r2', field: 'city', op: 'eq', value: 'SP' }] }],
};

const seg = (id: string, estimated_count: number): TalkXSegment => ({
  id, name: id, description: null, origin: 'zapp', status: 'active', is_favorite: false,
  rules: { groups: [] }, estimated_count, last_used_at: null, created_by: null,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
});

beforeEach(() => {
  state.rpcCalls.length = 0;
  state.updates.length = 0;
  state.updateFalhaEm.clear();
  toastSpy.error.mockReset();
});

describe('splitRules separa "em breve" de condição em branco', () => {
  it('conta as duas em incompleteCount, mas só a "em breve" em comingSoonCount', () => {
    expect(splitRules(soEmBreve)).toMatchObject({ incompleteCount: 1, comingSoonCount: 1 });
    expect(splitRules(emBrancoSo)).toMatchObject({ incompleteCount: 1, comingSoonCount: 0 });
    expect(splitRules(comCompleta)).toMatchObject({ incompleteCount: 1, comingSoonCount: 1 });
  });
});

describe('useAudienceEstimate · segmento só com condição "em breve"', () => {
  it('não conta nada e devolve count nulo em vez da base inteira', async () => {
    const { result } = renderHook(() => useAudienceEstimate(soEmBreve, true), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.count).toBeNull();
    expect(result.current.data?.sample).toEqual([]);
    expect(result.current.data?.incompleteCount).toBe(1);
    // Prova de que a base inteira nem foi perguntada ao banco.
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('condição em branco mantém a contagem da base (comportamento X008 intacto)', async () => {
    const { result } = renderHook(() => useAudienceEstimate(emBrancoSo, true), { wrapper });

    await waitFor(() => expect(result.current.data?.count).toBe(777));
    expect(state.rpcCalls.length).toBeGreaterThan(0);
  });

  it('com pelo menos uma condição completa a contagem volta a valer', async () => {
    const { result } = renderHook(() => useAudienceEstimate(comCompleta, true), { wrapper });

    await waitFor(() => expect(result.current.data?.count).toBe(777));
  });

  it('segmento sem condição nenhuma é mesmo toda a base', async () => {
    const { result } = renderHook(() => useAudienceEstimate({ groups: [] }, true), { wrapper });

    await waitFor(() => expect(result.current.data?.count).toBe(777));
  });
});

describe('refreshEstimates · um segmento que falha não cancela os outros', () => {
  it('recalcula todos, avisa quantos falharam e lê o erro do update', async () => {
    state.updateFalhaEm.add('b');
    const { result } = renderHook(() => useTalkXSegments(), { wrapper });

    result.current.refreshEstimates.mutate([seg('a', 1), seg('b', 2), seg('c', 3)]);

    // Os três chegam ao UPDATE: com Promise.all o 'c' nunca era tentado.
    await waitFor(() => expect(state.updates.map((u) => u.id)).toEqual(['a', 'b', 'c']));
    await waitFor(() => expect(toastSpy.error).toHaveBeenCalledWith('Recontagem incompleta: 1 de 3 segmento(s) não recalculado(s)'));
    expect(state.updates.every((u) => u.estimated_count === 777)).toBe(true);
  });

  it('sem falha nenhuma não há aviso de erro', async () => {
    const { result } = renderHook(() => useTalkXSegments(), { wrapper });

    result.current.refreshEstimates.mutate([seg('a', 1), seg('b', 2)]);

    await waitFor(() => expect(state.updates).toHaveLength(2));
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it('segmento cuja contagem não mudou não vai ao banco', async () => {
    const { result } = renderHook(() => useTalkXSegments(), { wrapper });

    result.current.refreshEstimates.mutate([seg('a', 777), seg('b', 2)]);

    await waitFor(() => expect(state.updates.map((u) => u.id)).toEqual(['b']));
  });
});
