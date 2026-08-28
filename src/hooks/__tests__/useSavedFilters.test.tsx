// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useSavedFilters } from '@/hooks/chat/useSavedFilters';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockFilters = [
  { id: 'f1', name: 'Active', filters: { status: 'active' }, is_default: true, created_at: '2024-01-01' },
  { id: 'f2', name: 'Urgent', filters: { priority: 'high' }, is_default: false, created_at: '2024-01-02' },
];

describe('useSavedFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockFilters, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'new' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('fetches filters for entity type', async () => {
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.filters).toHaveLength(2);
  });

  it('identifies default filter', async () => {
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.defaultFilter?.name).toBe('Active');
  });

  it('returns empty when no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.filters).toEqual([]);
  });

  it('exposes saveFilter mutation', () => {
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    expect(typeof result.current.saveFilter).toBe('function');
  });

  it('exposes deleteFilter mutation', () => {
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    expect(typeof result.current.deleteFilter).toBe('function');
  });

  it('exposes updateFilter function', () => {
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    expect(typeof result.current.updateFilter).toBe('function');
  });

  it('exposes setDefault function', () => {
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    expect(typeof result.current.setDefault).toBe('function');
  });

  it('handles different entity types', async () => {
    const { result } = renderHook(() => useSavedFilters('inbox'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('isLoading starts true', () => {
    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
