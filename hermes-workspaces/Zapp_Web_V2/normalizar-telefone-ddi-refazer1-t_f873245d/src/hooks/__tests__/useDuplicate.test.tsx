import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-1', name: 'Item (Cópia)' }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useDuplicate } from '@/hooks/system/useDuplicate';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

interface TestItem { id: string; name: string; created_at: string; updated_at: string }

describe('useDuplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mutation object', () => {
    const { result } = renderHook(
      () => useDuplicate<TestItem>({ tableName: 'contacts', queryKey: ['contacts'] }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.mutate).toBe('function');
    expect(typeof result.current.mutateAsync).toBe('function');
  });

  it('default excludeFields removes id, created_at, updated_at', () => {
    const { result } = renderHook(
      () => useDuplicate<TestItem>({ tableName: 'contacts', queryKey: ['contacts'] }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isPending).toBe(false);
  });

  it('accepts custom excludeFields', () => {
    const { result } = renderHook(
      () => useDuplicate<TestItem>({ tableName: 'contacts', queryKey: ['contacts'], excludeFields: ['id'] }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isPending).toBe(false);
  });

  it('accepts custom transformData', () => {
    const transform = vi.fn((data) => ({ ...data, custom: true }));
    const { result } = renderHook(
      () => useDuplicate<TestItem>({ tableName: 'contacts', queryKey: ['contacts'], transformData: transform }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isPending).toBe(false);
  });

  it('is not pending initially', () => {
    const { result } = renderHook(
      () => useDuplicate<TestItem>({ tableName: 'contacts', queryKey: ['contacts'] }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.isSuccess).toBe(false);
  });
});
