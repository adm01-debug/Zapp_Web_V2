/**
 * HZ3-001 — o aviso de navegador do chat interno exigia `isSubscribed` (o
 * liga/desliga de alertas do painel, que só fica ligado com assinatura de push
 * registrada) ALÉM da permissão já concedida. Quem autorizou o navegador mas não
 * assinou o push ficava só com o som e sem aviso visual.
 *
 * O código de produção usa `new Notification(...)` diretamente (sem passar por
 * `usePushNotifications().showNotification`). A condição é:
 * `'Notification' in window && Notification.permission === 'granted'`
 * + `settings.browserNotifications` + não estar em horário silencioso.
 *
 * Como é provado: com permissão concedida e `isSubscribed: false`, o alerta TEM de
 * sair; e as guardas que existem de verdade (sem permissão / liga-desliga do painel
 * em `notifSettings.browserNotifications`) continuam valendo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const avisos: Array<{ title: string; options: Record<string, unknown> }> = [];

  return {
    membership: [{ id: 'm1', is_muted: false }],
    settings: { soundEnabled: false, soundVolume: 60, browserNotifications: true },
    quiet: false,
    permission: 'granted' as NotificationPermission,
    isSubscribed: false,
    avisos,
    /** Callback de `postgres_changes` registrado pelo canal, como em produção. */
    handler: null as ((payload: unknown) => unknown) | null,
  };
});

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
      from: () => consulta,
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'eu' } }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: h.settings, isQuietHours: () => h.quiet }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({ isSubscribed: h.isSubscribed }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

import { useTeamChatNotifications } from '@/hooks/chat/useTeamChatNotifications';

const mensagem = (senderId: string, conversationId = 'c1') => ({
  new: {
    id: 'm1',
    conversation_id: conversationId,
    sender_id: senderId,
    content: 'oi',
    media_type: null,
    created_at: '2026-10-16T00:00:00Z',
  },
});

describe('useTeamChatNotifications — aviso do navegador (HZ3-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.avisos.length = 0;
    h.handler = null;
    h.membership = [{ id: 'm1', is_muted: false }];
    h.settings = { soundEnabled: false, soundVolume: 60, browserNotifications: true };
    h.quiet = false;
    h.permission = 'granted';
    h.isSubscribed = false;

    // Monta window.Notification (ausente no jsdom por padrão) capturando instâncias em h.avisos.
    // Usa function declaration (não arrow) porque arrow functions não são construtoras.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function MockNotif(this: any, title: string, options?: Record<string, unknown>) {
      h.avisos.push({ title, options: options ?? {} });
      this.onclick = null;
    }
    Object.defineProperty(MockNotif, 'permission', { get: () => h.permission, configurable: true });
    Object.defineProperty(window, 'Notification', { value: MockNotif, writable: true, configurable: true });
  });

  it('avisa no navegador com a permissão concedida, mesmo sem assinatura de push', async () => {
    renderHook(() => useTeamChatNotifications(null));

    expect(h.handler).toBeTruthy();
    await h.handler!(mensagem('outro'));

    expect(h.avisos).toHaveLength(1);
    expect(h.avisos[0].title).toContain('Teams');
    expect(h.avisos[0].options.data).toMatchObject({
      type: 'team_chat',
      conversationId: 'c1',
      messageId: 'm1',
    });
  });

  it('não avisa sem permissão do navegador (guarda de permissão preservada)', async () => {
    h.permission = 'default';
    renderHook(() => useTeamChatNotifications(null));

    await h.handler!(mensagem('outro'));

    expect(h.avisos).toHaveLength(0);
  });

  it('não avisa com o liga/desliga do painel desligado', async () => {
    h.settings.browserNotifications = false;
    renderHook(() => useTeamChatNotifications(null));

    await h.handler!(mensagem('outro'));

    expect(h.avisos).toHaveLength(0);
  });
});
