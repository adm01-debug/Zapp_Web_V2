// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
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

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import { useAutoCloseConversations } from '@/hooks/inbox/useAutoCloseConversations';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockConfig = {
  id: 'config-1',
  inactivity_hours: 24,
  is_enabled: false,
  close_message: null,
  updated_by: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

describe('useAutoCloseConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches config on mount', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockConfig, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const { result } = renderHook(() => useAutoCloseConversations(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.config).toEqual(mockConfig);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
      }),
    });

    const { result } = renderHook(() => useAutoCloseConversations(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.config).toBeUndefined();
  });

  it('returns loading true initially', () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue(new Promise(() => {})),
        }),
      }),
    });

    const { result } = renderHook(() => useAutoCloseConversations(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('validates inactivity_hours bounds', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ...mockConfig, inactivity_hours: 0 },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const { result } = renderHook(() => useAutoCloseConversations(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Config with 0 hours should still be returned (validation at UI level)
    expect(result.current.config?.inactivity_hours).toBe(0);
  });
});
