// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
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

const mockSurveys = [
  { id: 's1', contact_id: 'c1', agent_id: 'a1', rating: 5, feedback: 'Great!', created_at: '2024-01-01' },
  { id: 's2', contact_id: 'c2', agent_id: 'a1', rating: 3, feedback: null, created_at: '2024-01-02' },
  { id: 's3', contact_id: 'c3', agent_id: 'a2', rating: 1, feedback: 'Bad', created_at: '2024-01-03' },
];

describe('useCSAT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockSurveys, error: null }),
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockSurveys, error: null }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockSurveys[0], error: null }),
        }),
      }),
    });
  });

  it('fetches CSAT surveys', async () => {
    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.surveys).toBeDefined();
  });

  it('handles loading state', () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(new Promise(() => {})),
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(new Promise(() => {})),
        }),
      }),
    });

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('handles empty surveys', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useCSAT(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.surveys).toEqual([]);
  });
});
