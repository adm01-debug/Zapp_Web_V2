/**
 * Estimativa de público dos segmentos:
 *  - real_sector/real_uf ficam "em breve" (a estimativa lançava por falta de pré-resolução);
 *  - grupo só com regra "em breve" não vira "base inteira": contagem nula;
 *  - refreshEstimates não perde os segmentos bons quando um falha, e avisa por toast.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const fromTable = vi.fn();
const toastError = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: (...args: unknown[]) => fromTable(...args) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

import {
  RULE_FIELDS, useAudienceEstimate, useTalkXSegments, type SegmentRules, type TalkXSegment,
} from '@/hooks/integrations/useTalkXSegments';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const rules = (field: string, value = 'x'): SegmentRules => ({
  groups: [{ id: 'g', match: 'and', rules: [{ id: 'r', field, op: 'eq', value }] }],
} as never);

beforeEach(() => {
  rpc.mockReset();
  fromTable.mockReset();
  toastError.mockReset();
  rpc.mockResolvedValue({ data: { eligible: 5, rows: [], has_more: false, next_after: null }, error: null });
});

describe('real_sector/real_uf "em breve"', () => {
  it('não são selecionáveis (comingSoon) até existir pré-resolução', () => {
    for (const f of ['real_sector', 'real_uf']) {
      expect(RULE_FIELDS.find((r) => r.value === f)?.comingSoon).toBe(true);
    }
  });
});

describe('useAudienceEstimate · grupo só com regra "em breve"', () => {
  it.each(['lead_origin', 'real_sector'])('%s sozinho devolve contagem nula, sem consultar a base inteira', async (field) => {
    const { result } = renderHook(() => useAudienceEstimate(rules(field), true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.count).toBeNull();
    expect(result.current.data?.sample).toEqual([]);
    expect(result.current.data?.incompleteCount).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('regra comum continua contando normalmente', async () => {
    const { result } = renderHook(() => useAudienceEstimate(rules('company', 'Acme'), true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.count).toBe(5);
  });
});

describe('refreshEstimates · falha parcial', () => {
  const seg = (id: string, r: SegmentRules): TalkXSegment => ({
    id, name: id, description: null, origin: 'custom', status: 'active', is_favorite: false, rules: r,
    estimated_count: 1, last_used_at: null, created_by: null, created_at: '', updated_at: '',
  } as unknown as TalkXSegment);

  it('atualiza os que deram certo e avisa por toast quando um falha', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    fromTable.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.order = () => b;
      b.update = update;
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return b;
    });
    const { result } = renderHook(() => useTalkXSegments(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.refreshEstimates.mutateAsync([
        seg('ok', rules('company', 'Acme')),
        seg('ruim', rules('real_sector', 'Varejo')),
      ]);
    });
    expect(update).toHaveBeenCalledWith({ estimated_count: 5 });
    expect(eq).toHaveBeenCalledWith('id', 'ok');
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('1 de 2'));
  });
});
