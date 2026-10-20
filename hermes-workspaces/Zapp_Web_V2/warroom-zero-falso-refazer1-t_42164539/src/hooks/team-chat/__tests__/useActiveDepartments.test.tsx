import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * useActiveDepartments — seleção de colunas.
 *
 * A tabela public.departments NÃO tem coluna description (migration
 * 20260902120000). O hook selecionava description, o que causa erro
 * de coluna inexistente ou negação pelo RLS. O select correto leva
 * apenas id, name e is_active.
 */
const capturedSelect = vi.hoisted(() => ({ current: '' }));
const mockSelect = vi.fn((cols: string) => {
  capturedSelect.current = cols;
  return {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
});

const f = vi.hoisted(() => ({
  from: vi.fn(() => ({ select: mockSelect })),
}));

let capturedQueryFn: (() => Promise<unknown>) | undefined;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: f.from },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: { queryFn: () => Promise<unknown> }) => {
    capturedQueryFn = config.queryFn;
    return {
      data: undefined,
      isLoading: true,
      refetch: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('./queryKeys', () => ({
  queryKeys: { departments: { list: () => ['departments', 'list'] } },
}));

import { useActiveDepartments } from '@/hooks/team-chat/useActiveDepartments';

describe('useActiveDepartments — seleção de colunas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSelect.current = '';
    capturedQueryFn = undefined;
  });

  it('não seleciona a coluna description (inexistente na tabela departments)', async () => {
    renderHook(() => useActiveDepartments(true));
    await act(async () => {
      if (capturedQueryFn) await capturedQueryFn();
    });
    expect(capturedSelect.current).not.toContain('description');
  });

  it('seleciona apenas id, name e is_active', async () => {
    renderHook(() => useActiveDepartments(true));
    await act(async () => {
      if (capturedQueryFn) await capturedQueryFn();
    });
    expect(capturedSelect.current).toBe('id, name, is_active');
  });
});