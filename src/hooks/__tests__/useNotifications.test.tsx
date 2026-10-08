import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFrom = vi.fn();
let realtimeCallback: ((payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: unknown; old?: { id: string } }) => void) | undefined;
const mockChannel = vi.fn(() => ({
  on: vi.fn((_event: string, _filter: unknown, callback: NonNullable<typeof realtimeCallback>) => {
    realtimeCallback = callback;
    return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) };
  }),
}));
const mockRemoveChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: () => mockChannel(),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: import("react").ReactNode }) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  // O toast do `reminder_due` arrasta a cadeia de tarefas (useSendProduct →
  // useCatalogContactSearch), que cria o logger por `getLogger`.
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useNotifications } from '@/hooks/system/useNotifications';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockNotifications = [
  { id: 'n1', user_id: 'u1', title: 'New message', message: 'You have a new message', type: 'message', is_read: false, created_at: '2024-01-01' },
  { id: 'n2', user_id: 'u1', title: 'SLA alert', message: 'SLA breached', type: 'sla', is_read: true, created_at: '2024-01-02' },
];

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallback = undefined;
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockNotifications, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
  });

  it('returns empty when no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    expect(result.current.notifications).toEqual([]);
  });

  it('fetches notifications for logged-in user', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('calculates unread count correctly', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.unreadCount).toBe(1);
  });

  it('handles fetch error gracefully', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: new Error('Failed') }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('atualização falha após uma lista carregada: conserva a lista do mesmo usuário e expõe o erro', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(realtimeCallback).toBeTypeOf('function');

    await act(async () => {
      realtimeCallback?.({ eventType: 'UPDATE', new: { ...mockNotifications[0], is_read: true } });
    });

    // A consulta passa a falhar e a atualização é refeita sem depender de trocar
    // a identidade do objeto de auth com o mesmo user.id.
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: new Error('rede fora') }),
          }),
        }),
      }),
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });
});
