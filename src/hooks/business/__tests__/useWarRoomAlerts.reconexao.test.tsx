import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// O hook lê som/permissão destes dois módulos; aqui o som fica desligado para o
// teste observar só a revalidação de dados.
vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({ showNotification: vi.fn(), permission: 'default', isSubscribed: false }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: false, soundVolume: 50 },
    isQuietHours: () => false,
  }),
}));

const { from, canal } = vi.hoisted(() => {
  const fimWarroom = vi.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null });
  const fimVazio = vi.fn().mockResolvedValue({ data: [], error: null });
  const cadeiaWarroom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: fimWarroom,
    range: fimWarroom,
  };
  const cadeiaVazia = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: fimVazio,
    range: fimVazio,
  };
  const from = vi.fn((tabela: string) =>
    tabela === 'warroom_alerts' ? cadeiaWarroom : cadeiaVazia,
  );
  const canal = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return { from, canal };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...(args as [string])),
    channel: vi.fn(() => canal),
    removeChannel: vi.fn(),
  },
}));

import { useWarRoomAlerts } from '@/hooks/business/useWarRoomAlerts';

function envolver(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useWarRoomAlerts — reconexão', () => {
  beforeEach(() => {
    from.mockClear();
    canal.on.mockClear();
    canal.subscribe.mockClear();
  });

  it('revalida os alertas quando a rede volta, sem depender de um evento novo', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useWarRoomAlerts(), { wrapper: envolver(client) });

    // Carga inicial: warroom_alerts (limit) + conversation_sla (range).
    await waitFor(() => expect(from).toHaveBeenCalledTimes(2));

    act(() => { window.dispatchEvent(new Event('online')); });

    // A volta da rede invalida ['warroom-alerts']: a consulta roda de novo
    // sem nenhum INSERT no canal.
    await waitFor(() => expect(from).toHaveBeenCalledTimes(3));
  });
});
