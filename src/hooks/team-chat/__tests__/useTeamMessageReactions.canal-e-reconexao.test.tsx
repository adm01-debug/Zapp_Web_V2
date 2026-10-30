import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PE-75 — o canal de reações do Team Chat precisa de tópico exclusivo por
 * instância e de revalidação depois de uma queda de rede.
 */
const h = vi.hoisted(() => ({
  nomes: [] as string[],
  subs: [] as Array<(status: string) => void>,
  removeChannel: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'p1' } }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return {
    supabase: {
      from: () => builder,
      rpc: () => Promise.resolve({ error: null }),
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
  };
});

import { useTeamMessageReactions } from '@/hooks/team-chat/useTeamMessageReactions';

function render(conversationId = 'c1', queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => useTeamMessageReactions(conversationId), { wrapper }), queryClient };
}

beforeEach(() => {
  h.removeChannel.mockReset();
  h.nomes = [];
  h.subs = [];
});

describe('useTeamMessageReactions — tópico exclusivo e revalidação na reconexão (PE-75)', () => {
  it('dá sufixo exclusivo ao canal da conversa em cada montagem', async () => {
    const a = render('c1');
    const b = render('c1');

    await waitFor(() => expect(h.nomes.length).toBeGreaterThanOrEqual(2));

    expect(h.nomes[0].startsWith('team-reactions-c1:')).toBe(true);
    expect(h.nomes[0]).not.toBe(h.nomes[1]);

    a.unmount();
    b.unmount();
  });

  it('revalida as reações só na RE-inscrição, não na primeira', async () => {
    const { queryClient } = render('c1');
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(h.subs.length).toBe(1));

    act(() => h.subs[0]('SUBSCRIBED'));
    expect(invalidar).not.toHaveBeenCalled();

    act(() => h.subs[0]('SUBSCRIBED'));
    expect(invalidar.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(['team-reactions', 'c1']);
  });
});
