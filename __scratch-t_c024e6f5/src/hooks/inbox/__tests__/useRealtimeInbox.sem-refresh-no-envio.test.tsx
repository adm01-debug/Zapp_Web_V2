/**
 * PK-21 — envio de texto sem refresh no caminho (módulos reais, rede fingida).
 *
 * O defeito de origem: `handleSendMessage` chamava `refreshActiveConversation`
 * depois de enviar — dois fetches bloqueando o compositor. A regressão proibida
 * é QUALQUER fetch (lista, conversa, mensagens) dentro da janela do envio: o
 * transporte é RPC `enqueue_outbound_message` + Edge `message-delivery`, e a UI
 * anda pelo Realtime.
 *
 * Este teste usa os módulos REAIS do caminho de envio (`useRealtimeMessages`,
 * `useMessages`, `messageSender`, `outbound-message.service`, `ChatService`,
 * `RealtimeService`) e só finge a fronteira de rede (`supabase`: rpc, functions,
 * from) mais efeitos colaterais (som/notificação, transporte realtime, auth e
 * UI). Se alguém reintroduzir um fetch no envio, o `supabase.from` é chamado na
 * janela e o teste quebra.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rede = vi.hoisted(() => {
  // Construtor encadeável do PostgREST: qualquer método devolve o construtor;
  // `await` resolve lista vazia (inbox sem conversas no teste).
  const cadeia = (): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) =>
              resolve({ data: [], error: null, count: 0 });
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return () => Promise.resolve({ data: null, error: null });
          }
          return (..._args: unknown[]) => proxy;
        },
      },
    );
    return proxy;
  };
  return {
    from: vi.fn(() => cadeia()),
    rpc: vi.fn(async (nome: string) => {
      if (nome === 'enqueue_outbound_message') {
        return {
          data: { id: 'srv-1', status: 'queued', external_id: null },
          error: null,
        };
      }
      return { data: null, error: null };
    }),
    invoke: vi.fn(async (nome: string) => {
      if (nome === 'message-delivery') {
        return { data: { messageId: 'srv-1', status: 'sent' }, error: null };
      }
      return { data: null, error: null };
    }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: rede.from,
    rpc: rede.rpc,
    functions: { invoke: rede.invoke },
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
    }),
    removeChannel: () => {},
  },
}));

// Transporte realtime (assinaturas): fora do caminho de envio.
vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: () => {},
}));

// Som/notificação: efeito colateral, fora do caminho de envio.
vi.mock('@/hooks/realtime/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({
    newMessageNotification: null,
    notifyAboutIncomingMessage: vi.fn(),
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: 'c1',
    setSelectedContactId: vi.fn(),
    showNewConversation: false,
    setShowNewConversation: vi.fn(),
    showArchived: false,
    setShowArchived: vi.fn(),
    globalSearch: '',
    setGlobalSearch: vi.fn(),
    selectedQueueId: null,
    setSelectedQueueId: vi.fn(),
    selectedContactIds: [],
    setSelectedContactIds: vi.fn(),
    toggleSelectContact: vi.fn(),
    startNewConversation: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useRealtimeInbox } from '../useRealtimeInbox';

function montar() {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRealtimeInbox(), { wrapper });
}

describe('useRealtimeInbox — envio de texto sem refresh no caminho (PK-21)', () => {
  beforeEach(() => {
    rede.from.mockClear();
    rede.rpc.mockClear();
    rede.invoke.mockClear();
  });

  it('o envio usa RPC + Edge e NENHUM fetch roda na janela', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Só o que a montagem buscou; a janela do envio começa zerada.
    rede.from.mockClear();
    rede.rpc.mockClear();
    rede.invoke.mockClear();

    await act(async () => {
      await result.current.handleSendMessage('olá');
    });

    // O envio aconteceu de verdade (módulos reais até a rede).
    expect(rede.rpc).toHaveBeenCalledTimes(1);
    expect(rede.rpc.mock.calls[0]?.[0]).toBe('enqueue_outbound_message');
    expect(rede.invoke).toHaveBeenCalledTimes(1);
    expect(rede.invoke.mock.calls[0]?.[0]).toBe('message-delivery');
    // E nenhum fetch (lista, conversa, mensagens) rodou junto.
    expect(rede.from).not.toHaveBeenCalled();
  });

  it('a falha do envio propaga sem disparar fetch', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    rede.from.mockClear();
    rede.rpc.mockRejectedValueOnce(new Error('banco fora do ar'));

    await expect(
      act(async () => {
        await result.current.handleSendMessage('olá');
      }),
    ).rejects.toThrow('banco fora do ar');
    expect(rede.from).not.toHaveBeenCalled();
  });
});
