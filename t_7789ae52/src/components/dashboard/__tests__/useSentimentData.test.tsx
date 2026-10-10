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

// IA-023: ausência/valor inválido é EXCLUÍDO dos agregados (nunca vira 50) e
// nota 0 continua 0. Média sem nenhuma amostra válida é `null`, não 50.
describe('useSentimentData — zero e ausência (IA-023)', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const analysis = (over: Record<string, unknown>) => ({
    id: String(over.id ?? 'x'),
    contact_id: 'c1',
    sentiment: 'neutro',
    sentiment_score: null,
    created_at: daysAgo(1),
    analyzed_by: null,
    ...over,
  });

  beforeEach(() => {
    h.rpc.mockReset();
    h.analyses.mockReset();
    h.profiles.mockReset();
    h.rpc.mockResolvedValue({ data: [], error: null });
    h.analyses.mockResolvedValue({ data: [], error: null });
    h.profiles.mockResolvedValue({ data: [], error: null });
  });

  it('nota ausente é excluída da média e 0 continua 0 (não vira 50)', async () => {
    h.analyses.mockResolvedValue({
      data: [
        analysis({ id: '1', sentiment_score: 80, sentiment: 'positivo' }),
        analysis({ id: '2', sentiment_score: null, sentiment: 'negativo' }),
        analysis({ id: '3', sentiment_score: 0, sentiment: 'neutro' }),
      ],
      error: null,
    });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // (80 + 0) / 2 = 40 — o ausente NÃO entra como 50
    expect(result.current.stats.avgSentiment).toBe(40);
  });

  it('sem nenhuma amostra válida a média é null, não 50', async () => {
    h.analyses.mockResolvedValue({
      data: [analysis({ id: '1', sentiment_score: null }), analysis({ id: '2', sentiment_score: null })],
      error: null,
    });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats.avgSentiment).toBeNull();
  });

  it('criticidade: ausente não conta; 0 e 12 contam como crítico', async () => {
    h.rpc.mockResolvedValue({
      data: [
        { id: 'a', entity_id: 'c1', created_at: daysAgo(0), details: { sentiment_score: 12 } },
        { id: 'b', entity_id: 'c2', created_at: daysAgo(0), details: { sentiment_score: null } },
        { id: 'c', entity_id: 'c3', created_at: daysAgo(0), details: { sentiment_score: 0 } },
        { id: 'd', entity_id: 'c4', created_at: daysAgo(0), details: {} },
      ],
      error: null,
    });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats.criticalAlerts).toBe(2);
  });

  it('dailyData: dia sem amostra válida é null; nota 0 vira média 0', async () => {
    h.analyses.mockResolvedValue({
      data: [
        analysis({ id: 'today', sentiment_score: null, created_at: daysAgo(0) }),
        analysis({ id: 'old0', sentiment_score: 0, created_at: daysAgo(1) }),
      ],
      error: null,
    });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const byToday = result.current.dailyData[result.current.dailyData.length - 1];
    const byYesterday = result.current.dailyData[result.current.dailyData.length - 2];
    expect(byToday.avgScore).toBeNull();
    expect(byYesterday.avgScore).toBe(0);
  });

  it('agentData: ausente excluído da média e trend null quando falta metade', async () => {
    h.profiles.mockResolvedValue({ data: [{ id: 'ag1', name: 'Ana', avatar_url: null }], error: null });
    h.analyses.mockResolvedValue({
      data: [
        analysis({ id: 'f1', sentiment_score: 60, created_at: daysAgo(6), analyzed_by: 'ag1' }),
        analysis({ id: 's1', sentiment_score: null, created_at: daysAgo(1), analyzed_by: 'ag1' }),
      ],
      error: null,
    });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agentData).toHaveLength(1);
    expect(result.current.agentData[0].avgScore).toBe(60);
    expect(result.current.agentData[0].trend).toBeNull();
  });

  it('agentData: agente só com ausentes tem média null (não 0)', async () => {
    h.profiles.mockResolvedValue({ data: [{ id: 'ag1', name: 'Ana', avatar_url: null }], error: null });
    h.analyses.mockResolvedValue({
      data: [analysis({ id: 'f1', sentiment_score: null, created_at: daysAgo(6), analyzed_by: 'ag1' })],
      error: null,
    });
    const { result } = renderHook(() => useSentimentData('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agentData[0].avgScore).toBeNull();
  });
});
