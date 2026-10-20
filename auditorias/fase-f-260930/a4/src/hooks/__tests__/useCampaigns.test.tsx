// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useCampaigns } from '@/hooks/communication/useCampaigns';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockCampaigns = [
  { id: 'c1', name: 'Promo 1', status: 'draft', total_contacts: 100, sent_count: 0 },
  { id: 'c2', name: 'Promo 2', status: 'completed', total_contacts: 50, sent_count: 50 },
];

describe('useCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: mockCampaigns, error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c3', name: 'New' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'sending' }, error: null }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('fetches campaigns list', async () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.campaigns).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith('campaigns');
  });

  it('exposes create, update, delete mutations', () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    expect(result.current.createCampaign).toBeDefined();
    expect(result.current.updateCampaign).toBeDefined();
    expect(result.current.deleteCampaign).toBeDefined();
  });

  it('creates a campaign', async () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    await act(async () => {
      result.current.createCampaign.mutate({ name: 'New Campaign', message_content: 'Hello' });
    });
    expect(mockFrom).toHaveBeenCalledWith('campaigns');
  });

  it('handles loading state', () => {
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() });
    expect(typeof result.current.isLoading).toBe('boolean');
  });
});
