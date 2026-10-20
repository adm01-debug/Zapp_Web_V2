import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
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

import { useSearch } from '@/hooks/system/useSearch';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });
  });

  it('initializes with empty results', () => {
    const { result } = renderHook(
      () => useSearch('contacts', { columns: ['name', 'phone'] }),
      { wrapper: createWrapper() }
    );
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('provides setSearchTerm function', () => {
    const { result } = renderHook(
      () => useSearch('contacts', { columns: ['name'] }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.setSearchTerm).toBe('function');
  });

  it('provides clearSearch function', () => {
    const { result } = renderHook(
      () => useSearch('contacts', { columns: ['name'] }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.clearSearch).toBe('function');
  });

  it('hasResults is false initially', () => {
    const { result } = renderHook(
      () => useSearch('contacts', { columns: ['name'] }),
      { wrapper: createWrapper() }
    );
    expect(result.current.hasResults).toBe(false);
  });
});
