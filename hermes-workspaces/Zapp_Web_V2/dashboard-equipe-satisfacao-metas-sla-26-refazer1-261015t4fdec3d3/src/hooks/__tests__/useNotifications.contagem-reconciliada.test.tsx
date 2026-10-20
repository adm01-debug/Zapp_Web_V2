/**
 * R2-PLAT-002 (#440): o contador de não lidas do sino tem de ser sempre o mesmo
 * número que a lista do popover mostra. Antes, cada transição (leitura repetida,
 * UPDATE remoto, INSERT lido/duplicado, DELETE remoto) mexia no contador por
 * conta própria, sem conferir a transição anterior, e o badge divergia da lista.
 *
 * Cada teste dispara o caminho real (`useNotifications` com o cliente Supabase
 * mockado) e compara `unreadCount` com o que a lista renderiza.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Record<string, unknown>;
  old?: { id: string };
};

let dataRows: Record<string, unknown>[] = [];
let realtimeHandler: ((payload: RealtimePayload) => void) | null = null;

const thenable = (value: unknown) => {
  const node = {
    eq: (..._args: unknown[]) => node,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve),
  };
  return node;
};

const channelObj = {
  on: vi.fn((_event: string, _filter: unknown, cb: (payload: RealtimePayload) => void) => {
    realtimeHandler = cb;
    return channelObj;
  }),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
};

const mockFrom = vi.fn<(table: string) => unknown>();
const mockChannel = vi.fn<(name: string) => unknown>();
const mockRemoveChannel = vi.fn<(ch: unknown) => void>();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    channel: (name: string) => mockChannel(name),
    removeChannel: (ch: unknown) => mockRemoveChannel(ch),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: import('react').ReactNode }) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useNotifications } from '@/hooks/system/useNotifications';

const notification = (id: string, is_read: boolean) => ({
  id,
  user_id: 'u1',
  title: `Título ${id}`,
  message: `Mensagem ${id}`,
  type: 'info',
  is_read,
  created_at: '2026-10-06T12:00:00.000Z',
  read_at: is_read ? '2026-10-06T12:01:00.000Z' : null,
  metadata: {},
});

const dispatchRealtime = (payload: RealtimePayload) => {
  expect(realtimeHandler).not.toBeNull();
  return act(async () => {
    realtimeHandler!(payload);
  });
};

describe('useNotifications — contador reconciliado com a lista (R2-PLAT-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeHandler = null;
    dataRows = [];
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockChannel.mockReturnValue(channelObj);
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => ({ data: dataRows, error: null })),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue(thenable({ error: null })),
      delete: vi.fn().mockReturnValue(thenable({ error: null })),
      insert: vi.fn().mockReturnValue(thenable({ error: null })),
    });
  });

  const mount = async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result;
  };

  const unreadInList = (notifications: { is_read: boolean }[]) =>
    notifications.filter((n) => !n.is_read).length;

  it('e ponto de partida: contador é igual às não lidas da lista', async () => {
    dataRows = [notification('n1', false), notification('n2', false), notification('n3', true)];
    const result = await mount();

    expect(result.current.unreadCount).toBe(2);
    expect(result.current.unreadCount).toBe(unreadInList(result.current.notifications));
  });

  it('abrir uma notificação JÁ lida não reduz o contador (leitura repetida)', async () => {
    dataRows = [notification('n1', false), notification('n2', false), notification('n3', true)];
    const result = await mount();

    await act(async () => {
      await result.current.markAsRead('n3');
    });

    expect(result.current.unreadCount).toBe(2);
    expect(result.current.unreadCount).toBe(unreadInList(result.current.notifications));
  });

  it('UPDATE da leitura que chega ANTES do retorno HTTP não subtrai duas vezes', async () => {
    dataRows = [notification('n1', false), notification('n2', false)];
    const result = await mount();

    // A leitura de n1 chega antes pelo realtime (outra aba operou).
    await dispatchRealtime({
      eventType: 'UPDATE',
      new: { ...notification('n1', true) },
    });
    expect(result.current.unreadCount).toBe(1);

    // Agora conclui a mutation do operador, que também marcou n1 como lida.
    await act(async () => {
      await result.current.markAsRead('n1');
    });

    expect(result.current.unreadCount).toBe(1);
    expect(result.current.unreadCount).toBe(unreadInList(result.current.notifications));
  });

  it('DELETE remoto de uma não lida derruba o contador junto com a lista', async () => {
    dataRows = [notification('n1', false), notification('n2', false)];
    const result = await mount();

    await dispatchRealtime({ eventType: 'DELETE', old: { id: 'n1' } });

    expect(result.current.notifications.map((n) => n.id)).toEqual(['n2']);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.unreadCount).toBe(unreadInList(result.current.notifications));
  });

  it('INSERT remoto que já nasce lido não infla o contador', async () => {
    dataRows = [notification('n1', false)];
    const result = await mount();

    await dispatchRealtime({ eventType: 'INSERT', new: { ...notification('n4', true) } });

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.unreadCount).toBe(unreadInList(result.current.notifications));
  });

  it('INSERT remoto de um id que já está na lista não duplica a linha', async () => {
    dataRows = [notification('n1', false)];
    const result = await mount();

    await dispatchRealtime({ eventType: 'INSERT', new: { ...notification('n1', false) } });

    expect(result.current.notifications.map((n) => n.id)).toEqual(['n1']);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.unreadCount).toBe(unreadInList(result.current.notifications));
  });

  it('marcar todas como lidas zera contador e lista juntos', async () => {
    dataRows = [notification('n1', false), notification('n2', false)];
    const result = await mount();

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.is_read)).toBe(true);
  });
});
