/**
 * A fila de envio offline é do usuário que saiu: no `SIGNED_OUT` ela tem de sair
 * junto do cache offline e dos rascunhos, senão o texto parado no disco drenaria
 * como o próximo atendente que logasse na mesma máquina. O `AuthProvider` real é
 * montado e o evento é disparado pelo mesmo caminho que o Supabase usa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuth, AuthProvider } from '../useAuth';
import { offlineSendQueue, type OfflineQueueInput } from '@/lib/offlineQueue';

const harness = vi.hoisted(() => ({
  assinantes: [] as Array<(event: string, session: unknown) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      refreshSession: vi.fn(),
      setSession: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        harness.assinantes.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn(),
  },
}));

function mensagemDoUsuarioA(): OfflineQueueInput {
  return {
    clientMessageId: 'fila-do-atendente-a',
    userId: 'atendente-a',
    contactId: 'contato-x',
    content: 'texto do atendente A',
    messageType: 'text',
    mediaUrl: null,
    caption: null,
    replyToId: null,
    whatsappConnectionId: null,
  };
}

describe('AuthProvider — fila de envio offline no logout', () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    harness.assinantes.length = 0;
    localStorage.clear();
    await offlineSendQueue.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('esvazia a fila de envio offline quando o Supabase emite SIGNED_OUT', async () => {
    await offlineSendQueue.enqueue(mensagemDoUsuarioA());
    expect(await offlineSendQueue.list()).toHaveLength(1);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );

    renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(harness.assinantes.length).toBeGreaterThan(0));

    await act(async () => {
      harness.assinantes.forEach((cb) => cb('SIGNED_OUT', null));
    });

    await waitFor(async () => expect(await offlineSendQueue.list()).toEqual([]));
  });
});
