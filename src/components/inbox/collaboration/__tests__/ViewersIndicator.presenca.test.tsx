import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * R2-REALTIME — "canal de presença derruba a conversa".
 *
 * Ao entrar no canal, `useConversationViewers` fazia o select do perfil e o
 * `track` sem try/catch: qualquer falha de rede virava rejeição não tratada
 * dentro do callback do `subscribe`. E, ao desmontar, só chamava
 * `removeChannel` — nunca `unsubscribe` — o que deixava a presença do usuário
 * presa no canal.
 *
 * O teste exercita o hook REAL com o cliente do Supabase mockado (nenhum teste
 * fala com produção).
 */

const h = vi.hoisted(() => ({
  eventOrder: [] as string[],
  profileFails: false,
  trackFails: false,
  subscribeCb: null as ((status: string) => unknown) | null,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const logWarn = vi.fn();
vi.mock('@/lib/logger', () => ({
  log: { warn: (...args: unknown[]) => logWarn(...args) },
}));

vi.mock('@/integrations/supabase/client', () => {
  const channel: Record<string, unknown> = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn((cb: (status: string) => unknown) => {
    h.subscribeCb = cb;
    return channel;
  });
  channel.track = vi.fn(async () => {
    h.eventOrder.push('track');
    if (h.trackFails) throw new Error('track falhou');
    return 'ok';
  });
  channel.unsubscribe = vi.fn(async () => {
    h.eventOrder.push('unsubscribe');
  });
  channel.presenceState = vi.fn(() => ({}));

  const profileQuery: Record<string, unknown> = {};
  profileQuery.select = vi.fn(() => profileQuery);
  profileQuery.eq = vi.fn(() => profileQuery);
  profileQuery.maybeSingle = vi.fn(async () => {
    if (h.profileFails) throw new Error('select do perfil falhou');
    return { data: { name: 'Íris', avatar_url: null } };
  });

  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => {
        h.eventOrder.push('removeChannel');
      }),
      from: vi.fn(() => profileQuery),
    },
  };
});

const { useConversationViewers } = await import('../ViewersIndicator');

beforeEach(() => {
  vi.clearAllMocks();
  h.eventOrder = [];
  h.profileFails = false;
  h.trackFails = false;
  h.subscribeCb = null;
});

describe('useConversationViewers · presença', () => {
  it('falha ao anunciar presença (select ou track) não lança e vira aviso no log', async () => {
    h.profileFails = true;

    renderHook(() => useConversationViewers('contato-1'));

    await act(async () => {
      await h.subscribeCb?.('SUBSCRIBED');
    });

    await waitFor(() => expect(logWarn).toHaveBeenCalledWith(
      'Falha ao anunciar presença na conversa',
      expect.any(Error),
    ));
    // O `track` nem chegou a ser chamado porque o select falhou antes.
    expect(h.eventOrder).not.toContain('track');
  });

  it('falha no track também é tratada como aviso, não como rejeição não tratada', async () => {
    h.trackFails = true;

    renderHook(() => useConversationViewers('contato-1'));

    await act(async () => {
      await h.subscribeCb?.('SUBSCRIBED');
    });

    await waitFor(() => expect(logWarn).toHaveBeenCalledWith(
      'Falha ao anunciar presença na conversa',
      expect.any(Error),
    ));
  });

  it('ao desmontar, sai do canal (unsubscribe) antes de removê-lo', async () => {
    const { unmount } = renderHook(() => useConversationViewers('contato-1'));

    await act(async () => {
      await h.subscribeCb?.('SUBSCRIBED');
    });

    unmount();

    expect(h.eventOrder).toContain('unsubscribe');
    expect(h.eventOrder.indexOf('unsubscribe')).toBeLessThan(h.eventOrder.indexOf('removeChannel'));
  });
});
