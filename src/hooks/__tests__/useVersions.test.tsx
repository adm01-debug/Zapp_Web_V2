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

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useVersions } from '@/hooks/system/useVersions';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockVersions = [
  { id: 'v2', entity_type: 'contacts', entity_id: 'c1', version_number: 2, data: { name: 'Updated' }, changed_by: 'u1', changed_at: '2024-01-02', change_summary: 'Updated name' },
  { id: 'v1', entity_type: 'contacts', entity_id: 'c1', version_number: 1, data: { name: 'Original' }, changed_by: 'u1', changed_at: '2024-01-01', change_summary: 'Created' },
];

describe('useVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockVersions, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('fetches versions for entity', async () => {
    const { result } = renderHook(() => useVersions('contacts', 'c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.versions).toHaveLength(2);
  });

  it('currentVersion is the latest', async () => {
    const { result } = renderHook(() => useVersions('contacts', 'c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentVersion?.version_number).toBe(2);
  });

  it('does not fetch when entityId is empty', async () => {
    const { result } = renderHook(() => useVersions('contacts', ''), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('exposes restoreVersion function', async () => {
    const { result } = renderHook(() => useVersions('contacts', 'c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(typeof result.current.restoreVersion).toBe('function');
  });

  it('handles fetch error', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useVersions('contacts', 'c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('handles empty versions', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useVersions('contacts', 'c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.versions).toEqual([]);
    expect(result.current.currentVersion).toBeUndefined();
  });
});
