import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Estado compartilhado com as fábricas de vi.mock (hoisted: os mocks são
// elevados acima dos imports e não podem capturar consts do corpo do arquivo).
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  sessao: { user: { id: 'usuario-1' } } as { user: { id: string } } | null,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ session: h.sessao }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: h.rpc, functions: { invoke: h.invoke } },
}));

import { useOfflineSendQueueDrain } from '../useOfflineSendQueueDrain';
import { offlineSendQueue, type OfflineQueueInput } from '@/lib/offlineQueue';
import { sendThrottle } from '@/lib/sendThrottle';

function item(reposicao: number): OfflineQueueInput {
  return {
    clientMessageId: `0c5d8df5-430d-4f46-8c0a-764be03511${reposicao.toString().padStart(2, '0')}`,
    contactId: `contato-${reposicao}`,
    content: `mensagem ${reposicao}`,
    messageType: 'text',
    mediaUrl: null,
    caption: null,
    replyToId: null,
    whatsappConnectionId: null,
  };
}

/** Espera o fim da drenagem de abertura (2 itens passam pelo throttle de 500 ms). */
function esperarDrenagem(chamadas: number) {
  return waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(chamadas), { timeout: 5_000 });
}

describe('useOfflineSendQueueDrain', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    h.sessao = { user: { id: 'usuario-1' } };
    delete (navigator as unknown as Record<string, unknown>).onLine;
    sendThrottle.reset();
    await offlineSendQueue.clear();
    h.rpc.mockImplementation(async (_nome: string, args: Record<string, unknown>) => ({
      data: { id: `linha-${args.p_client_message_id}`, status: 'sending', external_id: null },
      error: null,
    }));
    h.invoke.mockImplementation(async (_fn: string, opcoes: { body: { messageId: string } }) => ({
      data: { messageId: opcoes.body.messageId, status: 'sent', externalId: null, idempotent: false },
      error: null,
    }));
  });

  it('com sessão e rede entrega a fila da abertura uma vez e não duplica ao remontar', async () => {
    await offlineSendQueue.enqueue(item(1));
    await offlineSendQueue.enqueue(item(2));

    const first = renderHook(() => useOfflineSendQueueDrain());

    await esperarDrenagem(2);
    expect(h.rpc.mock.calls.map(([, args]) => args.p_client_message_id)).toEqual([
      '0c5d8df5-430d-4f46-8c0a-764be0351101',
      '0c5d8df5-430d-4f46-8c0a-764be0351102',
    ]);
    expect(await offlineSendQueue.list()).toEqual([]);

    // Remontar não relança o que já saiu: a fila ficou vazia e a chave estável
    // `clientMessageId` continua sendo a mesma para qualquer reenvio.
    first.unmount();
    renderHook(() => useOfflineSendQueueDrain());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.rpc).toHaveBeenCalledTimes(2);
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('sem sessão autenticada não entrega nada da abertura', async () => {
    h.sessao = null;
    await offlineSendQueue.enqueue(item(1));

    renderHook(() => useOfflineSendQueueDrain());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
    expect((await offlineSendQueue.list()).map((m) => m.clientMessageId)).toEqual([
      '0c5d8df5-430d-4f46-8c0a-764be0351101',
    ]);
  });

  it('com a rede caída na abertura a mensagem continua na fila', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await offlineSendQueue.enqueue(item(1));

    renderHook(() => useOfflineSendQueueDrain());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(h.rpc).not.toHaveBeenCalled();
    expect((await offlineSendQueue.list()).map((m) => m.clientMessageId)).toEqual([
      '0c5d8df5-430d-4f46-8c0a-764be0351101',
    ]);
  });
});
