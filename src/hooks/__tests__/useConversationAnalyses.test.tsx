import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, mockGetUser, limitSpy } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  limitSpy: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useConversationAnalyses } from '@/hooks/chat/useConversationAnalyses';
import { log } from '@/lib/logger';

const CONTACT_UUID = '11111111-1111-4111-8111-111111111111';

const mockAnalyses = [
  {
    id: 'a1', contact_id: CONTACT_UUID, analyzed_by: 'p1', summary: 'Customer wants refund',
    status: 'completed', key_points: ['refund request'], next_steps: ['process refund'],
    sentiment: 'negativo', sentiment_score: 0.3, topics: ['billing'], urgency: 'alta',
    customer_satisfaction: 2, message_count: 15, created_at: '2024-01-01',
  },
  {
    id: 'a2', contact_id: CONTACT_UUID, analyzed_by: 'p1', summary: 'General inquiry',
    status: 'completed', key_points: ['product info'], next_steps: ['send catalog'],
    sentiment: 'neutro', sentiment_score: 0.5, topics: ['products'], urgency: 'baixa',
    customer_satisfaction: 4, message_count: 5, created_at: '2024-01-02',
  },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 30_000 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, Wrapper };
}

function mockListOk(rows: typeof mockAnalyses | null) {
  limitSpy.mockResolvedValue({ data: rows, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'conversation_analyses') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ limit: limitSpy }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockAnalyses[0], error: null }),
          }),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
          }),
        }),
      };
    }
    return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
  });
}

describe('useConversationAnalyses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockListOk(mockAnalyses);
  });

  it('busca as análises do contato (uuid válido)', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analyses).toHaveLength(2);
    expect(limitSpy).toHaveBeenCalledTimes(1);
  });

  it('várias montagens do mesmo contato geram UMA consulta (cache compartilhado)', async () => {
    const { Wrapper } = createWrapper();
    const first = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    const second = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.analyses).toHaveLength(2));
    expect(limitSpy).toHaveBeenCalledTimes(1);
  });

  it('id que não é uuid não dispara consulta', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses('contato-5511999999999@s.whatsapp.net'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analyses).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(limitSpy).not.toHaveBeenCalled();
  });

  it('devolve vazio e não consulta para contactId nulo', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(null), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analyses).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('expõe o erro da consulta sem quebrar', async () => {
    mockListOk(null);
    limitSpy.mockResolvedValue({ data: null, error: new Error('Failed') });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.analyses).toEqual([]);
    await waitFor(() =>
      expect(vi.mocked(log.error)).toHaveBeenCalledWith('Error fetching analyses:', expect.anything()),
    );
  });

  it('refetch com contactId nulo não dispara consulta', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(null), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.refetch();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(limitSpy).not.toHaveBeenCalled();
  });

  it('refetch com id que não é uuid não dispara consulta', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses('contato-5511999999999@s.whatsapp.net'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.refetch();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(limitSpy).not.toHaveBeenCalled();
  });

  it('salvar invalida o cache e revalida a lista', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.analyses).toHaveLength(2));
    expect(limitSpy).toHaveBeenCalledTimes(1);

    await result.current.saveAnalysis({
      contact_id: CONTACT_UUID, summary: 'Nova', status: 'completed',
      key_points: [], next_steps: [], sentiment: 'neutro', sentiment_score: 0.5,
      topics: [], urgency: 'baixa', customer_satisfaction: 3, message_count: 1,
    });

    await waitFor(() => expect(limitSpy).toHaveBeenCalledTimes(2));
  });

  it('refetch recarrega e não rejeita', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.analyses).toHaveLength(2));
    await expect(result.current.refetch()).resolves.toBeTruthy();
    await waitFor(() => expect(limitSpy).toHaveBeenCalledTimes(2));
  });

  it('getLatestAnalysis devolve a primeira análise', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getLatestAnalysis()?.id).toBe('a1');
  });

  it('getSentimentTrend continua calculando a tendência', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Menos de 10 itens: não há janela "antiga" (5..10) para comparar.
    expect(result.current.getSentimentTrend()).toBeNull();
  });

  it('getSentimentTrend classifica melhora quando os recentes sobem', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      ...mockAnalyses[0],
      id: `a${i}`,
      // 5 recentes (0..4) com nota 8; 5 antigas (5..9) com nota 0.1 -> diff 7.9 (> 5 = melhora).
      sentiment_score: i < 5 ? 8 : 0.1,
    }));
    mockListOk(rows as typeof mockAnalyses);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useConversationAnalyses(CONTACT_UUID), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.analyses).toHaveLength(10));
    expect(result.current.getSentimentTrend()).toBe('improving');
  });
});
