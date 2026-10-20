import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Regressão do bug de 25/09 (PR #764): fetchData era referenciado no
// useEffect antes de sua declaração (const). Naquela versão isso não
// chegava a virar ReferenceError em runtime (o efeito só roda depois do
// corpo do componente terminar), mas travava o lint ratchet
// (react-hooks/immutability) e, na versão final, fetchData virou
// useCallback com o useEffect dependendo de [fetchData] — se essa ordem
// for invertida de novo, a própria avaliação do array de deps do
// useEffect (síncrona, durante o render) lança um ReferenceError real.
// Este arquivo monta o hook de verdade para pegar isso antes do CI.

const h = vi.hoisted(() => ({ rpc: vi.fn(), analyses: vi.fn(), profiles: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: (table: string) => {
      if (table === 'conversation_analyses') {
        return { select: () => ({ gte: () => ({ order: () => h.analyses() }) }) };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => h.profiles() }) };
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
  },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { useSentimentData } from '../useSentimentData';

describe('useSentimentData', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    h.analyses.mockReset();
    h.profiles.mockReset();
    h.rpc.mockResolvedValue({ data: [], error: null });
    h.analyses.mockResolvedValue({ data: [], error: null });
    h.profiles.mockResolvedValue({ data: [], error: null });
  });

  it('monta sem lançar exceção e sai do loading (guarda contra TDZ de fetchData no useEffect)', async () => {
    const { result } = renderHook(() => useSentimentData('7'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.alerts).toEqual([]);
    expect(result.current.analyses).toEqual([]);
    expect(h.rpc).toHaveBeenCalledWith('dashboard_sentiment_alerts', expect.objectContaining({ p_since: expect.any(String) }));
  });

  it('erro na RPC é capturado — nunca escapa do hook e loading sempre volta a false', async () => {
    h.rpc.mockResolvedValue({ data: null, error: new Error('rpc indisponível') });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.alerts).toEqual([]);
  });

  it('mapeia os alertas da RPC (id/entity_id/created_at/details) para o shape do hook', async () => {
    h.rpc.mockResolvedValue({
      data: [{ id: 'a1', entity_id: 'contact-1', created_at: '2026-09-25T00:00:00.000Z', details: { sentiment_score: 12, agent_name: 'Ana' } }],
      error: null,
    });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.alerts).toEqual([
      { id: 'a1', contactId: 'contact-1', createdAt: '2026-09-25T00:00:00.000Z', sentiment_score: 12, agent_name: 'Ana' },
    ]);
    expect(result.current.stats.criticalAlerts).toBe(1);
  });

  it('refazer o fetch manualmente (fetchData) não lança e mantém referência estável entre renders com o mesmo período', async () => {
    const { result, rerender } = renderHook(({ period }) => useSentimentData(period), { initialProps: { period: '7' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstFetchData = result.current.fetchData;
    rerender({ period: '7' });
    expect(result.current.fetchData).toBe(firstFetchData);
    await expect(result.current.fetchData()).resolves.toBeUndefined();
  });
});
