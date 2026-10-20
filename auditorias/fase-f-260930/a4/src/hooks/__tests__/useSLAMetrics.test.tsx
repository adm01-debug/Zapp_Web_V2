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

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { useSLAMetrics } from '@/hooks/sla/useSLAMetrics';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockSLAData = [
  { id: 's1', contact_id: 'c1', first_response_breached: false, resolution_breached: false, first_response_at: '2024-01-01T10:05:00Z', first_message_at: '2024-01-01T10:00:00Z', resolved_at: '2024-01-01T11:00:00Z' },
  { id: 's2', contact_id: 'c2', first_response_breached: true, resolution_breached: true, first_response_at: null, first_message_at: '2024-01-01T10:00:00Z', resolved_at: null },
];

describe('useSLAMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockSLAData, error: null }),
          lte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockSLAData, error: null }),
          }),
        }),
        order: vi.fn().mockResolvedValue({ data: mockSLAData, error: null }),
      }),
    });
  });

  it('fetches SLA metrics', async () => {
    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
  });

  it('handles loading state correctly', () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(new Promise(() => {})),
        }),
        order: vi.fn().mockReturnValue(new Promise(() => {})),
      }),
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(true);
  });

  it('handles empty SLA data', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('handles fetch errors gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
      }),
    });

    const { result } = renderHook(() => useSLAMetrics(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
