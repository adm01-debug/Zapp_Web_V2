import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Supabase client mock (hoisted) -----------------------------------------
const { channelMock, authMock, insertSingle, fromMock, invokeMock, rpcMock, removeChannelMock, serverLoginMock } = vi.hoisted(() => {
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb?: (s: string) => void) => {
      cb?.('SUBSCRIBED');
      return { unsubscribe: vi.fn() };
    }),
    unsubscribe: vi.fn(),
  };
  const authMock = {
    signInWithPassword: vi.fn(),
    setSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  };
  const insertSingle = vi.fn().mockResolvedValue({
    data: { id: 'msg-1', contact_id: 'c1', content: 'hi' },
    error: null,
  });
  const fromMock = vi.fn((_table?: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn(() => ({ select: () => ({ single: insertSingle }) })),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  }));
  const invokeMock = vi.fn().mockResolvedValue({ data: { messageId: 'msg-1', status: 'sent', externalId: 'ext-1' }, error: null });
  const rpcMock = vi.fn().mockResolvedValue({ data: { id: 'msg-1', status: 'sending', external_id: null }, error: null });
  const removeChannelMock = vi.fn();
  const serverLoginMock = vi.fn();
  return { channelMock, authMock, insertSingle, fromMock, invokeMock, rpcMock, removeChannelMock, serverLoginMock };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: authMock,
    from: (table: string) => (fromMock as unknown as (t: string) => unknown)(table),
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
    functions: { invoke: invokeMock },
    rpc: rpcMock,
  },
}));
vi.mock('@/lib/serverLogin', () => ({ serverLogin: (...args: unknown[]) => serverLoginMock(...args) }));

import { supabase } from '@/integrations/supabase/client';
import { AuthService } from '@/services/auth.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('smoke: login', () => {
  it('sets the session returned by the lockout-aware edge', async () => {
    serverLoginMock.mockResolvedValueOnce({ ok: true, accessToken: 't', refreshToken: 'r' });
    const res = await AuthService.signIn('a@b.com', 'pw123456');
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
    expect(res.error).toBeNull();
  });

  it('surfaces invalid credentials', async () => {
    serverLoginMock.mockResolvedValueOnce({ ok: false, unavailable: false, error: 'Invalid login credentials', lock: { isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 } });
    const res = await AuthService.signIn('a@b.com', 'wrong');
    expect(res.error).toBeTruthy();
  });
});

describe('smoke: logout', () => {
  it('calls supabase signOut', async () => {
    await AuthService.signOut();
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('smoke: conversation creation (send message)', () => {
  it('enqueues then dispatches a message through the atomic gateway', async () => {
    const { sendMessageToContact } = await import('@/hooks/realtime/messageSender');
    const res = await sendMessageToContact('c1', 'hi');
    expect(res.id).toBe('msg-1');
    expect(rpcMock).toHaveBeenCalledWith('enqueue_outbound_message', expect.objectContaining({ p_contact_id: 'c1', p_content: 'hi' }));
    expect(invokeMock).toHaveBeenCalledWith('message-delivery', { body: { messageId: 'msg-1' } });
  });
});

describe('smoke: realtime sync', () => {
  it('subscribes to postgres_changes on messages and tears down', () => {
    const channel = supabase.channel('smoke-messages');
    channel.on('postgres_changes' as never, { event: '*', schema: 'public', table: 'messages' } as never, () => {});
    const sub = channel.subscribe();
    expect(channelMock.on).toHaveBeenCalled();
    expect(channelMock.subscribe).toHaveBeenCalled();
    supabase.removeChannel(sub as never);
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
