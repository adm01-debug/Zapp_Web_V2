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
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: vi.fn(),
    channel: (nome: string) => {
      h.nomes.push(nome);
      const canal: Record<string, unknown> = {};
      canal.on = () => canal;
      canal.subscribe = (cb: (status: string) => void) => {
        h.subs.push(cb);
        return canal;
      };
      return canal;
    },
    removeChannel: (...args: unknown[]) => h.removeChannel(...args),
  },
}));

vi.mock('@/hooks/team-chat/useTeamReadState', () => ({
  deriveOwnMessageStatus: vi.fn(() => 'sent' as const),
  useTeamReadState: vi.fn(() => ({ readStates: {}, isLoading: false })),
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

    await waitFor(() => expect(h.nomes.length).toBeGreaterThanOrEqual(2));

    expect(h.nomes[0].startsWith('team-messages-conv-1:')).toBe(true);
    expect(h.nomes[1].startsWith('team-messages-conv-1:')).toBe(true);
    expect(h.nomes[0]).not.toBe(h.nomes[1]);

    a.unmount();
    b.unmount();
  });

  it('revalida a página corrente só na RE-inscrição, não na primeira', async () => {
    const { queryClient } = render('conv-1');
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    // React 18+ strict-mode executa setup→cleanup→setup: há 1 ou 2 subs.
    // Mais de 2 = canal duplicado real (regressão detectável).
    await waitFor(() => expect(h.subs.length).toBeGreaterThanOrEqual(1));
    expect(h.subs.length).toBeLessThanOrEqual(2);
    const sub = h.subs[h.subs.length - 1];

    act(() => sub('SUBSCRIBED'));
    expect(invalidar).not.toHaveBeenCalled();

    act(() => sub('SUBSCRIBED'));
    const chaves = invalidar.mock.calls.map((c) => c[0]?.queryKey);
    expect(chaves).toContainEqual(['team-messages', 'conv-1']);
    expect(invalidar).toHaveBeenCalledTimes(2);
  });

  it('revalida depois de um erro de canal seguido de nova inscrição', async () => {
    const { queryClient } = render('conv-1');
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(h.subs.length).toBeGreaterThanOrEqual(1));
    const sub = h.subs[h.subs.length - 1];

    act(() => sub('SUBSCRIBED'));
    act(() => sub('CHANNEL_ERROR'));
    act(() => sub('SUBSCRIBED'));

    expect(invalidar).toHaveBeenCalled();
  });
});
