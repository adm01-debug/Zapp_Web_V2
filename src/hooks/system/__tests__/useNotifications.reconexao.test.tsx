import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { from, canal, mockUser } = vi.hoisted(() => {
  const fim = vi.fn().mockResolvedValue({ data: [], error: null });
  const cadeia = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: fim,
  };
  const from = vi.fn((_tabela: string) => cadeia);
  const canal = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  const mockUser = { id: 'user-1' };
  return { from, canal, mockUser };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...(args as [string])),
    channel: vi.fn(() => canal),
    removeChannel: vi.fn(),
  },
}));

import { useNotifications } from '@/hooks/system/useNotifications';

function envolver(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useNotifications — reconexão', () => {
  beforeEach(() => {
    from.mockClear();
    canal.on.mockClear();
    canal.subscribe.mockClear();
  });

  it('recarrega as notificações quando a rede volta, sem depender de um evento novo', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useNotifications(), { wrapper: envolver(client) });

    // Carga inicial: fetchNotifications (limit 100).
    await waitFor(() => expect(from).toHaveBeenCalledTimes(1));

    act(() => { window.dispatchEvent(new Event('online')); });

    // useRealtimeReconnect(fetchNotifications): a consulta roda de novo sem
    // nenhum broadcast no canal.
    await waitFor(() => expect(from).toHaveBeenCalledTimes(2));
  });
});
