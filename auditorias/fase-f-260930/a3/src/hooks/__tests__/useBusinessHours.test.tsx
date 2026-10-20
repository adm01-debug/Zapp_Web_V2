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

import { useBusinessHours } from '@/hooks/business/useBusinessHours';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockHours = [
  { id: 'bh1', whatsapp_connection_id: 'wc1', day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
  { id: 'bh2', whatsapp_connection_id: 'wc1', day_of_week: 0, is_open: false, open_time: null, close_time: null },
];

function makeMockChain(data: any[] | null, error: any = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
}

describe('useBusinessHours', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(makeMockChain(mockHours));
  });

  it('fetches business hours for connection', async () => {
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.businessHours).toBeDefined();
  });

  it('generates default hours when DB returns empty', async () => {
    mockFrom.mockReturnValue(makeMockChain([]));
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Hook generates defaults for all 7 days when empty
    expect(result.current.businessHours?.length).toBe(7);
  });

  it('identifies closed days correctly', async () => {
    const { result } = renderHook(() => useBusinessHours('wc1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const sunday = result.current.businessHours?.find((h: any) => h.day_of_week === 0);
    expect(sunday?.is_open).toBe(false);
  });
});
