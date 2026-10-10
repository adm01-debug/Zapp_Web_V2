import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
      update: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useBulkActions } from '@/hooks/inbox/useBulkActions';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

interface TestItem { id: string; name: string }

const testItems: TestItem[] = [
  { id: '1', name: 'Item 1' },
  { id: '2', name: 'Item 2' },
  { id: '3', name: 'Item 3' },
];

describe('useBulkActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with no selection', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.hasSelection).toBe(false);
    expect(result.current.selectionCount).toBe(0);
  });

  it('toggleSelection adds item', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.toggleSelection('1');
    });

    expect(result.current.selectedIds.has('1')).toBe(true);
    expect(result.current.selectionCount).toBe(1);
    expect(result.current.hasSelection).toBe(true);
  });

  it('toggleSelection removes item if already selected', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.toggleSelection('1');
    });
    act(() => {
      result.current.toggleSelection('1');
    });

    expect(result.current.selectedIds.has('1')).toBe(false);
    expect(result.current.selectionCount).toBe(0);
  });

  it('deselectAll clears selection', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.toggleSelection('1');
      result.current.toggleSelection('2');
    });

    act(() => {
      result.current.deselectAll();
    });

    expect(result.current.selectionCount).toBe(0);
  });

  it('isSelected returns correct value', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.toggleSelection('1');
    });

    expect(result.current.isSelected('1')).toBe(true);
    expect(result.current.isSelected('2')).toBe(false);
  });

  it('selectOne adds single item', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.selectOne('2');
    });

    expect(result.current.isSelected('2')).toBe(true);
  });

  it('selectAll selects everything', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.selectAll();
    });

    expect(result.current.isAllSelected).toBe(true);
    expect(result.current.selectionCount).toBe(3);
  });

  it('isPartiallySelected is true when some selected', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.toggleSelection('1');
    });

    expect(result.current.isPartiallySelected).toBe(true);
  });

  it('selectedItems returns correct items', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.toggleSelection('2');
    });

    expect(result.current.selectedItems).toEqual([{ id: '2', name: 'Item 2' }]);
  });

  it('isExecuting is false initially', () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'test' }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isExecuting).toBe(false);
  });
});
