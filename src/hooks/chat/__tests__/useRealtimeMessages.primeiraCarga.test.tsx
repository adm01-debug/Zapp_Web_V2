import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// R2-INB-* (lista sem piscar): `loading` fica true a CADA busca (o RefreshCw gira com
// ele). A lista de conversas só deve trocar por esqueletos enquanto a PRIMEIRA busca
// ainda não trouxe conversas — por isso o hook expõe `initialLoading`, que vira false
// quando a primeira busca resolve e NÃO volta a true num refetch/reconexão. Antes a
// sidebar usava `loading` e a lista piscava trocando por esqueletos em cada refetch.
const h = vi.hoisted(() => ({
  configs: [] as Array<{ channelName: string; onReconnect?: () => void }>,
  fetchInitialConversations: vi.fn(),
}));

type RealtimeConfigProbe = { channelName: string; onReconnect?: () => void };

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: { channelName: string; onReconnect?: () => void }) => {
    h.configs.push(config);
  },
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
    fetchInitialConversations: h.fetchInitialConversations,
    fetchContactsByIds: vi.fn().mockResolvedValue([]),
    markMessagesAsRead: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/hooks/realtime/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({
    newMessageNotification: null,
    notifyAboutIncomingMessage: vi.fn(),
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));

vi.mock('@/hooks/realtime/useMessageUpdateBatcher', () => ({
  useMessageUpdateBatcher: () => ({ handleMessageUpdate: vi.fn() }),
}));

vi.mock('@/hooks/realtime/messageSender', () => ({
  sendMessageToContact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn(), from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useRealtimeMessages } from '@/hooks/chat/useRealtimeMessages';

const CONVERSA_CARREGADA = [
  {
    contact: { id: 'contato-1', name: 'Cliente 1' },
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.configs = [];
});

describe('useRealtimeMessages — inicialização da lista sem piscar', () => {
  it('só fica em "primeira carga" até a 1ª busca resolver; refetch em voo mantém a lista', async () => {
    let resolverSegundaBusca: ((value: unknown) => void) | undefined;
    h.fetchInitialConversations
      .mockResolvedValueOnce(CONVERSA_CARREGADA)
      .mockImplementationOnce(() => new Promise((resolve) => { resolverSegundaBusca = resolve; }));

    const { result } = renderHook(() => useRealtimeMessages());

    // Antes da primeira busca resolver: estado de esqueleto.
    expect(result.current.initialLoading).toBe(true);

    // Primeira busca conclui: a lista chega e `initialLoading` vira false.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.initialLoading).toBe(false);
    expect(result.current.conversations).toHaveLength(1);

    // Segunda busca (reconexão/refetch) fica EM VOO: `loading` volta a true para o
    // RefreshCw, mas a lista NÃO volta ao esqueleto.
    const messagesChannel = h.configs.find((c: RealtimeConfigProbe) => c.channelName === 'global-messages-realtime');
    expect(messagesChannel?.onReconnect).toBeTypeOf('function');
    messagesChannel?.onReconnect?.();

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.initialLoading).toBe(false);
    expect(result.current.conversations).toHaveLength(1);

    resolverSegundaBusca?.(CONVERSA_CARREGADA);
  });
});
