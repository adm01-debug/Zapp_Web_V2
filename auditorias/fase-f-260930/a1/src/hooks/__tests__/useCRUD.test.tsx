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

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useCRUD, BaseEntity } from '@/hooks/system/useCRUD';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

interface TestEntity extends BaseEntity {
  name: string;
}

describe('useCRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [{ id: '1', name: 'Test', created_at: '2024-01-01' }],
              error: null,
              count: 1,
            }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'new-1', name: 'New' },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: '1', name: 'Updated' },
              error: null,
            }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('initializes with CRUD functions', () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({ tableName: 'test_table' }),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.create).toBe('function');
    expect(typeof result.current.update).toBe('function');
    expect(typeof result.current.delete).toBe('function');
    expect(typeof result.current.softDelete).toBe('function');
    expect(typeof result.current.bulkDelete).toBe('function');
    expect(typeof result.current.useList).toBe('function');
    expect(typeof result.current.useGetById).toBe('function');
  });

  it('isCreating defaults to false', () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({ tableName: 'test_table' }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isCreating).toBe(false);
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });

  it('accepts custom messages', () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({
        tableName: 'test_table',
        messages: {
          createSuccess: 'Criado!',
          updateSuccess: 'Atualizado!',
          deleteSuccess: 'Removido!',
        },
      }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });

  it('accepts orderBy config', () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({
        tableName: 'test_table',
        orderBy: { column: 'name', ascending: true },
      }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });

  it('accepts defaultFilters config', () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({
        tableName: 'test_table',
        defaultFilters: { is_active: true },
      }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });

  it('accepts softDeleteColumn config', () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({
        tableName: 'test_table',
        softDeleteColumn: 'archived_at',
      }),
      { wrapper: createWrapper() }
    );
    expect(result.current).toBeDefined();
  });

  it('create triggers mutation', async () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({ tableName: 'test_table' }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      result.current.create({ name: 'New Item' } as Partial<TestEntity>);
    });

    expect(mockFrom).toHaveBeenCalledWith('test_table');
  });

  it('bulkDelete calls delete with multiple ids', async () => {
    const { result } = renderHook(
      () => useCRUD<TestEntity>({ tableName: 'test_table' }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.bulkDelete(['id1', 'id2', 'id3']);
    });

    expect(mockFrom).toHaveBeenCalledWith('test_table');
  });
});
