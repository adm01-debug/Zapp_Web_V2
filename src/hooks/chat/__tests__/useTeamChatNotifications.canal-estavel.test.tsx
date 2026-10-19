import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HZ5-09 — o canal de notificação do Chat interno era recriado toda vez que o
 * usuário mexia no volume (as preferências estavam nas deps do efeito). Aqui a
 * fronteira mockada é o cliente Supabase, o provedor de notificações e o RPC de
 * nomes; o `QueryClientContext` é real, para semear o cache do inbox.
 */
const h = vi.hoisted(() => ({
  profile: { id: 'eu' } as { id: string } | null,
  settings: { soundEnabled: false, soundVolume: 60, browserNotifications: true },
  handler: null as ((payload: unknown) => unknown) | null,
  channelNames: [] as unknown[],
  fromTables: [] as unknown[],
  membership: [{ id: 'm1', is_muted: false }] as Array<{ id: string; is_muted: boolean }>,
  erro: null as string | null,
  logWarn: vi.fn(),
  rpc: vi.fn(),
  show: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const canal: Record<string, unknown> = {};
  canal.on = (_evt: string, _cfg: unknown, cb: (p: unknown) => unknown) => {
    h.handler = cb;
    return canal;
  };
  canal.subscribe = () => ({ unsubscribe: vi.fn() });
  const consulta: Record<string, unknown> = {};
  consulta.select = () => consulta;
  consulta.eq = () => consulta;
  consulta.limit = () =>
    Promise.resolve(
      h.erro ? { data: null, error: { message: h.erro } } : { data: h.membership, error: null },
    );
  return {
    supabase: {
      channel: (name: unknown) => {
        h.channelNames.push(name);
        return canal;
      },
      removeChannel: vi.fn(),
      from: (table: unknown) => {
        h.fromTables.push(table);
        return consulta;
      },
      rpc: (...args: unknown[]) => h.rpc(...args),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: h.profile }) }));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: h.settings, isQuietHours: () => false }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({
    showNotification: (...args: unknown[]) => h.show(...args),
    isSubscribed: true,
    permission: 'granted',
  }),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: (...args: unknown[]) => h.logWarn(...args),
    debug: vi.fn(),
    info: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

import { useTeamChatNotifications } from '@/hooks/chat/useTeamChatNotifications';
import { queryKeys } from '@/hooks/team-chat/queryKeys';

const mensagem = (senderId = 'outro') => ({
  new: {
    id: 'm1',
    conversation_id: 'c1',
    sender_id: senderId,
    content: 'oi',
    media_type: null,
    created_at: '2026-10-13T00:00:00Z',
  },
});

const conversa = (membros: Array<{ profile_id: string; is_muted: boolean }>) =>
  ({ id: 'c1', members: membros }) as never;

function wrapper(client: QueryClient | null) {
  return ({ children }: { children: React.ReactNode }) =>
    client ? (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ) : (
      <>{children}</>
    );
}

beforeEach(() => {
  h.profile = { id: 'eu' };
  h.settings = { soundEnabled: false, soundVolume: 60, browserNotifications: true };
  h.handler = null;
  h.channelNames = [];
  h.fromTables = [];
  h.membership = [{ id: 'm1', is_muted: false }];
  h.erro = null;
  h.logWarn.mockReset();
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: [{ id: 'outro', name: 'Ana' }], error: null });
  h.show.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useTeamChatNotifications — canal estável (HZ5-09)', () => {
  it('assina um único canal com tópico exclusivo por instância', () => {
    renderHook(() => useTeamChatNotifications(null));

    expect(h.channelNames).toHaveLength(1);
    expect(String(h.channelNames[0])).toMatch(/^team-chat-notifications:/);
  });

  it('mexer no volume não recria o canal', () => {
    const { rerender } = renderHook(() => useTeamChatNotifications(null));
    expect(h.channelNames).toHaveLength(1);

    h.settings = { ...h.settings, soundVolume: 90 };
    rerender();
    h.settings = { ...h.settings, soundEnabled: true, browserNotifications: false };
    rerender();

    expect(h.channelNames).toHaveLength(1);
  });

  it('usa a associação do cache do inbox sem consultar o banco', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.inbox('eu'), [conversa([{ profile_id: 'eu', is_muted: false }])]);

    renderHook(() => useTeamChatNotifications(null), { wrapper: wrapper(client) });
    await act(async () => { await h.handler!(mensagem()); });

    expect(h.fromTables).not.toContain('team_conversation_members');
    expect(h.show).toHaveBeenCalledWith(expect.objectContaining({ title: '💬 Teams: Ana' }));
  });

  it('não notifica nem vai ao banco quando o cache diz que não é membro', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.inbox('eu'), [conversa([{ profile_id: 'outro', is_muted: false }])]);

    renderHook(() => useTeamChatNotifications(null), { wrapper: wrapper(client) });
    await act(async () => { await h.handler!(mensagem()); });

    expect(h.fromTables).not.toContain('team_conversation_members');
    expect(h.show).not.toHaveBeenCalled();
  });

  it('cai para o banco quando a conversa não está no cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useTeamChatNotifications(null), { wrapper: wrapper(client) });
    await act(async () => { await h.handler!(mensagem()); });

    expect(h.fromTables).toContain('team_conversation_members');
    expect(h.show).toHaveBeenCalled();
  });

  it('silencia conversa mutada ainda que esteja em cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.inbox('eu'), [conversa([{ profile_id: 'eu', is_muted: true }])]);

    renderHook(() => useTeamChatNotifications(null), { wrapper: wrapper(client) });
    await act(async () => { await h.handler!(mensagem()); });

    expect(h.show).not.toHaveBeenCalled();
    expect(h.fromTables).not.toContain('team_conversation_members');
  });

  it('falha ao ler a associação não vira "sem resultados": não notifica e não quebra', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    h.erro = 'permission denied';

    renderHook(() => useTeamChatNotifications(null), { wrapper: wrapper(client) });
    await act(async () => { await h.handler!(mensagem()); });

    expect(h.fromTables).toContain('team_conversation_members');
    expect(h.show).not.toHaveBeenCalled();
    expect(h.logWarn).toHaveBeenCalledWith(
      'Falha ao confirmar participação na conversa; sem notificação:',
      'permission denied',
    );
  });
});
