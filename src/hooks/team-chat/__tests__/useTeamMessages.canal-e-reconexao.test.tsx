import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O canal de recibos tem contrato próprio; este teste observa só mensagens.
vi.mock('@/hooks/team-chat/useTeamReadState', () => ({
  useTeamReadState: () => ({ readStates: {} }),
  deriveOwnMessageStatus: () => 'sent',
}));

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
  event: (_payload: Record<string, unknown>) => {},
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: vi.fn(),
    channel: (nome: string) => {
      h.nomes.push(nome);
      const canal: Record<string, unknown> = {};
      canal.on = (_kind: string, _options: unknown, callback: typeof h.event) => {
        h.event = callback;
        return canal;
      };
      canal.subscribe = (cb: (status: string) => void) => {
        h.subs.push(cb);
        return canal;
      };
      return canal;
    },
    removeChannel: (...args: unknown[]) => h.removeChannel(...args),
  },
}));

import { useTeamMessages, type TeamMessageEvent } from '@/hooks/team-chat/useTeamMessages';

function render(conversationId = 'conv-1', queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }), onEvent?: (event: TeamMessageEvent) => void) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => useTeamMessages(conversationId, onEvent), { wrapper }), queryClient };
}

beforeEach(() => {
  h.rpc.mockReset();
  h.removeChannel.mockReset();
  h.nomes = [];
  h.subs = [];
  h.rpc.mockResolvedValue({ data: [], error: null });
});

describe('useTeamMessages — tópico exclusivo e revalidação na reconexão (PE-75)', () => {
  it('propaga edição/exclusão às páginas antigas e pede ressincronização após queda', async () => {
    const onEvent = vi.fn();
    render('conv-1', undefined, onEvent);
    await waitFor(() => expect(h.subs).toHaveLength(1));
    act(() => h.event({ eventType: 'UPDATE', new: { id: 'old-1', content: 'editada', is_edited: true, updated_at: '2026-10-16T10:00:00Z' } }));
    expect(onEvent).toHaveBeenCalledWith({ type: 'update', id: 'old-1', content: 'editada', is_edited: true, updated_at: '2026-10-16T10:00:00Z' });
    act(() => h.event({ eventType: 'DELETE', old: { id: 'old-1' } }));
    expect(onEvent).toHaveBeenCalledWith({ type: 'delete', id: 'old-1' });
    act(() => { h.subs[0]('SUBSCRIBED'); h.subs[0]('SUBSCRIBED'); });
    expect(onEvent).toHaveBeenLastCalledWith({ type: 'resync' });
  });

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
