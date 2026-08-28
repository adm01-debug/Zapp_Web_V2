import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Supabase client mock (hoisted) -----------------------------------------
const { channelMock, authMock, insertSingle, fromMock, invokeMock, removeChannelMock } = vi.hoisted(() => {
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
  const invokeMock = vi.fn().mockResolvedValue({ data: { key: { id: 'ext-1' } }, error: null });
  const removeChannelMock = vi.fn();
  return { channelMock, authMock, insertSingle, fromMock, invokeMock, removeChannelMock };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: authMock,
    from: (table: string) => (fromMock as unknown as (t: string) => unknown)(table),
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
    functions: { invoke: invokeMock },
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { AuthService } from '@/services/auth.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('smoke: login', () => {
  it('signs in with email/password', async () => {
    authMock.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: { access_token: 't' } },
      error: null,
    });
    const res = await AuthService.signIn('a@b.com', 'pw123456');
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw123456' });
    expect(res.error).toBeNull();
  });

  it('surfaces invalid credentials', async () => {
    authMock.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' } as never,
    });
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
  it('inserts a message row for the contact', async () => {
    // Patch from('contacts').single to return a connected contact
    const calls: Record<string, unknown> = {};
    fromMock.mockImplementation(((table: string) => {
      calls[table] = true;
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { phone: '5511999999999', whatsapp_connection_id: 'conn-1' },
            error: null,
          }),
        } as never;
      }
      if (table === 'whatsapp_connections') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { instance_id: 'inst', status: 'connected' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as never;
      }
      if (table === 'messages') {
        return {
          insert: vi.fn(() => ({ select: () => ({ single: insertSingle }) })),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as never;
      }
      // profiles
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
      } as never;
    }) as never);

    const { sendMessageToContact } = await import('@/hooks/realtime/messageSender');
    const res = await sendMessageToContact('c1', 'hi');
    expect(res.id).toBe('msg-1');
    expect(insertSingle).toHaveBeenCalled();
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