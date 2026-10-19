import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PE-75 — a notificação do chat interno tinha dois defeitos: o nome do
 * remetente vinha de `profiles` (leitura barrada pela RLS para o agente, então o
 * título caía para 'Colega') e o clique não tinha tratador. Aqui a fronteira
 * mockada é o cliente Supabase, o service worker e a navegação.
 *
 * E também: o aviso de desktop saía por `usePushNotifications.showNotification`, que
 * exige Service Worker de aplicação — e `config/service_worker.ts` mantém
 * `SERVICE_WORKER_ENABLED=false`, então o hook devolvia `false` em silêncio e o chat
 * de equipe só tocava o som. Agora o aviso é a API `Notification` direta
 * (`showBrowserNotification`), observada aqui por uma classe `Notification` falsa,
 * com o push (Service Worker) desligado: `navigator.serviceWorker` deste teste não
 * tem `ready`, e o aviso sai mesmo assim.
 */
type NotificacaoFalsa = {
  title: string;
  options?: NotificationOptions;
  onclick: (() => void) | null;
};

const h = vi.hoisted(() => ({
  profile: { id: 'eu' } as { id: string } | null,
  handler: null as ((payload: unknown) => unknown) | null,
  membership: [{ id: 'm1', is_muted: false }],
  fromArgs: [] as unknown[][],
  rpc: vi.fn(),
  notificacoes: [] as unknown[],
  navigate: vi.fn(),
  focus: vi.fn(),
  swListener: null as ((event: { data?: unknown }) => void) | null,
  swAdd: vi.fn(),
  swRemove: vi.fn(),
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
  consulta.limit = () => Promise.resolve({ data: h.membership, error: null });
  return {
    supabase: {
      channel: () => canal,
      removeChannel: vi.fn(),
      from: (...args: unknown[]) => {
        h.fromArgs.push(args);
        return consulta;
      },
      rpc: (...args: unknown[]) => h.rpc(...args),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: h.profile }) }));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: false, soundVolume: 60, browserNotifications: true },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (...args: unknown[]) => h.navigate(...args),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
}));

import { useTeamChatNotifications } from '@/hooks/chat/useTeamChatNotifications';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(public title: string, public options?: NotificationOptions) {
    // A própria instância fica registrada: `showBrowserNotification` liga o `onclick`
    // DEPOIS de construir, e o teste precisa do tratador de verdade.
    (h.notificacoes as NotificacaoFalsa[]).push(this);
  }
}

const emitidas = () => h.notificacoes as NotificacaoFalsa[];

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

beforeEach(() => {
  h.profile = { id: 'eu' };
  h.handler = null;
  h.fromArgs = [];
  h.rpc.mockReset();
  h.notificacoes = [];
  h.navigate.mockReset();
  h.focus.mockReset();
  h.swAdd.mockReset();
  h.swRemove.mockReset();
  h.swListener = null;

  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: FakeNotification,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: (tipo: string, cb: (event: { data?: unknown }) => void) => {
        h.swAdd(tipo);
        h.swListener = cb;
      },
      removeEventListener: (...args: unknown[]) => h.swRemove(...args),
    },
  });
  vi.spyOn(window, 'focus').mockImplementation(() => h.focus());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error — remove o stub do service worker entre os testes
  delete navigator.serviceWorker;
});

describe('useTeamChatNotifications — nome do remetente e clique (PE-75)', () => {
  it('usa o nome do remetente vindo de get_team_profiles', async () => {
    h.rpc.mockResolvedValue({ data: [{ id: 'outro', name: 'Ana' }], error: null });

    renderHook(() => useTeamChatNotifications(null));
    await act(async () => { await h.handler!(mensagem()); });

    expect(h.rpc).toHaveBeenCalledWith('get_team_profiles');
    expect(emitidas()[0].title).toBe('💬 Teams: Ana');
    // A leitura direta de `profiles` (barrada pela RLS) não é mais usada.
    expect(h.fromArgs.every((args) => args[0] !== 'profiles')).toBe(true);
  });

  it('cai para "Colega" quando a RPC falha', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'denied' } });

    renderHook(() => useTeamChatNotifications(null));
    await act(async () => { await h.handler!(mensagem()); });

    expect(emitidas()[0].title).toBe('💬 Teams: Colega');
  });

  it('mostra o aviso de desktop sem Service Worker de aplicação (push desligado)', async () => {
    h.rpc.mockResolvedValue({ data: [{ id: 'outro', name: 'Ana' }], error: null });

    renderHook(() => useTeamChatNotifications(null));
    await act(async () => { await h.handler!(mensagem()); });

    // `navigator.serviceWorker` aqui não tem `ready`: o aviso não depende dele.
    expect(emitidas()).toHaveLength(1);
    expect(emitidas()[0].options?.tag).toBe('team-msg-c1');
    expect(emitidas()[0].options?.body).toBe('oi');
  });

  it('o clique na notificação direta abre o Chat Interno', async () => {
    h.rpc.mockResolvedValue({ data: [{ id: 'outro', name: 'Ana' }], error: null });

    renderHook(() => useTeamChatNotifications(null));
    await act(async () => { await h.handler!(mensagem()); });

    act(() => { emitidas()[0].onclick?.(); });

    expect(h.focus).toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith('team-chat');
  });

  it('o clique repassado pelo service worker continua abrindo o Chat Interno', () => {
    renderHook(() => useTeamChatNotifications(null));

    expect(h.swAdd).toHaveBeenCalledWith('message');

    act(() => {
      h.swListener!({ data: { type: 'NOTIFICATION_CLICK', data: { type: 'team_chat', conversationId: 'c9' } } });
    });

    expect(h.focus).toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith('team-chat');
  });

  it('ignora um clique de notificação de outro tipo', () => {
    renderHook(() => useTeamChatNotifications(null));

    act(() => {
      h.swListener!({ data: { type: 'NOTIFICATION_CLICK', data: { type: 'security' } } });
    });

    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.focus).not.toHaveBeenCalled();
  });
});
