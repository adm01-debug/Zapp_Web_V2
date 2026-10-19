import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PE-75 — o canal de mensagens do Team Chat precisa de tópico exclusivo por
 * instância e de revalidação depois de uma queda de rede.
 *
 * O grafo realtime é falso: o teste captura o nome pedido ao `supabase.channel`
 * e o callback de `subscribe`, que é onde a reconexão é observada.
 */
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  nomes: [] as string[],
  subs: [] as Array<(status: string) => void>,
  removeChannel: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: vi.fn(),
    channel: (nome: string) => {
      h.nomes.push(nome);
      const canal: Record<string, unknown> = {};
      canal.on = () => canal;
      canal.subscribe = (cb?: (status: string) => void) => {
        // useTeamReadState chama .subscribe() sem callback; só registrar os
        // canais de mensagem que passam o callback de status.
        if (cb) h.subs.push(cb);
        return canal;
      };
      return canal;
    },
    removeChannel: (...args: unknown[]) => h.removeChannel(...args),
  },
}));

import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';

function render(conversationId = 'conv-1', queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => useTeamMessages(conversationId), { wrapper }), queryClient };
}

beforeEach(() => {
  h.rpc.mockReset();
  h.removeChannel.mockReset();
  h.nomes = [];
  h.subs = [];
  h.rpc.mockResolvedValue({ data: [], error: null });
});

describe('useTeamMessages — tópico exclusivo e revalidação na reconexão (PE-75)', () => {
  it('dá sufixo exclusivo ao canal da conversa em cada montagem', async () => {
    const a = render('conv-1');
    const b = render('conv-1');

    // useTeamReadState também cria canais; filtrar só os de mensagem.
    await waitFor(() =>
      expect(h.nomes.filter(n => n.startsWith('team-messages-')).length).toBeGreaterThanOrEqual(2),
    );
    const msgNomes = h.nomes.filter(n => n.startsWith('team-messages-'));
    expect(msgNomes[0].startsWith('team-messages-conv-1:')).toBe(true);
    expect(msgNomes[1].startsWith('team-messages-conv-1:')).toBe(true);
    expect(msgNomes[0]).not.toBe(msgNomes[1]);

    a.unmount();
    b.unmount();
  });

  it('revalida a página corrente só na RE-inscrição, não na primeira', async () => {
    const { queryClient } = render('conv-1');
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(h.subs.length).toBe(1));

    act(() => h.subs[0]('SUBSCRIBED'));
    expect(invalidar).not.toHaveBeenCalled();

    act(() => h.subs[0]('SUBSCRIBED'));
    const chaves = invalidar.mock.calls.map((c) => c[0]?.queryKey);
    expect(chaves).toContainEqual(['team-messages', 'conv-1']);
    expect(invalidar).toHaveBeenCalledTimes(2);
  });

  it('revalida depois de um erro de canal seguido de nova inscrição', async () => {
    const { queryClient } = render('conv-1');
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(h.subs.length).toBe(1));

    act(() => h.subs[0]('SUBSCRIBED'));
    act(() => h.subs[0]('CHANNEL_ERROR'));
    act(() => h.subs[0]('SUBSCRIBED'));

    expect(invalidar).toHaveBeenCalled();
  });
});
