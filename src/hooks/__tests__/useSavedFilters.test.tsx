import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();
const mockGetUser = vi.fn();
// Consultas de leitura montadas (para inspecionar `.eq/.or/.order/.limit`).
const selectChains: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
// Assinantes de `onAuthStateChange` (limpeza de cache no logout).
const authCbs: Array<(event: string) => void> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
      onAuthStateChange: vi.fn((cb: (event: string) => void) => {
        authCbs.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useSavedFilters } from '@/hooks/chat/useSavedFilters';

/**
 * Construtor da consulta encadeada de `saved_filters` (a leitura agora faz
 * dois `.order()` e um `.limit()`); resolvido no fim, como o PostgREST real.
 */
function selectChain(result: { data: unknown; error: unknown }, reject = false) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  q.eq = vi.fn(() => q);
  q.or = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.limit = vi.fn(() => (reject ? Promise.reject(result.error) : Promise.resolve(result)));
  selectChains.push(q);
  return q;
}

function lastSelectChain() {
  return selectChains[selectChains.length - 1];
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function wrapperWithClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const mockFilters = [
  { id: 'f1', name: 'Active', filters: { status: 'active' }, is_default: true, created_at: '2024-01-01' },
  { id: 'f2', name: 'Urgent', filters: { priority: 'high' }, is_default: false, created_at: '2024-01-02' },
];

describe('useSavedFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectChains.length = 0;
    authCbs.length = 0;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain({ data: mockFilters, error: null })),
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
      select: vi.fn().mockReturnValue(selectChain({ data: null, error: new Error('DB error') }, true)),
    });

    const { result } = renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('aplica teto (.limit) e desempate por id na leitura de filtros salvos', async () => {
    renderHook(() => useSavedFilters('contacts'), { wrapper: createWrapper() });
    await waitFor(() => expect(selectChains.length).toBeGreaterThan(0));

    const chain = lastSelectChain();
    expect(chain.limit).toHaveBeenCalledWith(50);
    // Ordem determinística: created_at desc + id como desempate.
    expect(chain.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: true }],
    ]);
  });

  it('não pede filtro compartilhado ao ler presets do Inbox (são só do dono)', async () => {
    renderHook(() => useSavedFilters('inbox_filters'), { wrapper: createWrapper() });
    await waitFor(() => expect(selectChains.length).toBeGreaterThan(0));

    const chain = lastSelectChain();
    expect(chain.eq).toHaveBeenCalledWith('entity_type', 'inbox_filters');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(chain.or).not.toHaveBeenCalled();
  });

  it('limpa o cache de filtros salvos quando o Supabase emite SIGNED_OUT', async () => {
    const { qc, wrapper } = wrapperWithClient();
    renderHook(() => useSavedFilters('contacts'), { wrapper });
    await waitFor(() => expect(authCbs.length).toBeGreaterThan(0));
    await waitFor(() => expect(qc.getQueryData(['saved-filters', 'contacts'])).toBeDefined());

    act(() => authCbs.forEach((cb) => cb('SIGNED_OUT')));

    expect(qc.getQueryData(['saved-filters', 'contacts'])).toBeUndefined();
  });
});
