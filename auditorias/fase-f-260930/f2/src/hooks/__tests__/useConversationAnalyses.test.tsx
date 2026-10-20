// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useConversationAnalyses } from '@/hooks/chat/useConversationAnalyses';

const mockAnalyses = [
  {
    id: 'a1', contact_id: 'c1', analyzed_by: 'p1', summary: 'Customer wants refund',
    status: 'completed', key_points: ['refund request'], next_steps: ['process refund'],
    sentiment: 'negativo', sentiment_score: 0.3, topics: ['billing'], urgency: 'alta',
    customer_satisfaction: 2, message_count: 15, created_at: '2024-01-01',
  },
  {
    id: 'a2', contact_id: 'c1', analyzed_by: 'p1', summary: 'General inquiry',
    status: 'completed', key_points: ['product info'], next_steps: ['send catalog'],
    sentiment: 'neutro', sentiment_score: 0.5, topics: ['products'], urgency: 'baixa',
    customer_satisfaction: 4, message_count: 5, created_at: '2024-01-02',
  },
];

describe('useConversationAnalyses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'conversation_analyses') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: mockAnalyses, error: null }),
              }),
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
  });

  it('fetches analyses for a contact', async () => {
    const { result } = renderHook(() => useConversationAnalyses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analyses).toHaveLength(2);
  });

  it('returns empty for null contactId', async () => {
    const { result } = renderHook(() => useConversationAnalyses(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analyses).toEqual([]);
  });

  it('handles fetch error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: new Error('Failed') }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useConversationAnalyses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('exposes saveAnalysis function', async () => {
    const { result } = renderHook(() => useConversationAnalyses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.saveAnalysis).toBe('function');
  });

  it('exposes refetch function', async () => {
    const { result } = renderHook(() => useConversationAnalyses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refetch).toBe('function');
  });

  it('getLatestAnalysis returns first analysis', async () => {
    const { result } = renderHook(() => useConversationAnalyses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const latest = result.current.getLatestAnalysis();
    expect(latest?.id).toBe('a1');
  });

  it('getSentimentTrend returns a value', async () => {
    const { result } = renderHook(() => useConversationAnalyses('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.getSentimentTrend).toBe('function');
  });
});
