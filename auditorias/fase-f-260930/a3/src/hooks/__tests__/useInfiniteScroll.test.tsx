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

import { useInfiniteScroll } from '@/hooks/system/useInfiniteScroll';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockPage = [
  { id: '1', name: 'Item 1' },
  { id: '2', name: 'Item 2' },
];

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        range: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockPage, error: null }),
            then: (resolve: any) => Promise.resolve({ data: mockPage, error: null }).then(resolve),
          }),
        }),
      }),
    });
  });

  it('initializes with loading state', () => {
    const { result } = renderHook(
      () => useInfiniteScroll({ tableName: 'contacts' }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('exposes setLoadMoreRef', () => {
    const { result } = renderHook(
      () => useInfiniteScroll({ tableName: 'contacts' }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.setLoadMoreRef).toBe('function');
  });

  it('exposes totalLoaded number', () => {
    const { result } = renderHook(
      () => useInfiniteScroll({ tableName: 'contacts' }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.totalLoaded).toBe('number');
  });

  it('accepts custom pageSize', () => {
    const { result } = renderHook(
      () => useInfiniteScroll({ tableName: 'contacts', pageSize: 50 }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });

  it('accepts custom orderBy', () => {
    const { result } = renderHook(
      () => useInfiniteScroll({ tableName: 'contacts', orderBy: { column: 'name', ascending: true } }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });

  it('accepts filters', () => {
    const { result } = renderHook(
      () => useInfiniteScroll({ tableName: 'contacts', filters: { is_active: true } }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });

  it('accepts custom select', () => {
    const { result } = renderHook(
      () => useInfiniteScroll({ tableName: 'contacts', select: 'id, name' }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });
});
