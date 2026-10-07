import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

/**
 * TC-007 — o listener de notificações do Team Chat só era montado dentro de
 * `TeamChatView`: com o módulo fechado (ex.: tela de Contatos) o atendente não
 * recebia alerta nenhum. Agora existe UM listener global
 * (`TeamChatNotificationsListener`, montado no nível do app) e a conversa em
 * foco chega por um store publicado pela view — sem duplicar o canal.
 *
 * O grafo WebAudio é falso: o hook de produção toca por osciladores.
 */
const grafo = { rampas: [] as number[] };

class FakeGainNode {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((valor: number) => {
      grafo.rampas.push(valor);
    }),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeOscillatorNode {
  type = 'sine';
  frequency = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator() {
    return new FakeOscillatorNode();
  }
  createGain() {
    return new FakeGainNode();
  }
  resume() {
    return Promise.resolve();
  }
}

const h = vi.hoisted(() => ({
  profile: { id: 'eu' } as { id: string } | null,
  channelCalls: 0,
  membership: [] as Array<{ id: string; is_muted: boolean }>,
  settings: { soundEnabled: true, soundVolume: 60, browserNotifications: false },
  quiet: false,
  /** Callback de `postgres_changes` registrado pelo canal, para disparar o alerta. */
  handler: null as ((payload: unknown) => unknown) | null,
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
      channel: () => {
        h.channelCalls += 1;
        return canal;
      },
      removeChannel: vi.fn(),
      from: () => consulta,
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: h.profile }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: h.settings, isQuietHours: () => h.quiet }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({ showNotification: vi.fn(), isSubscribed: false, permission: 'default' }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

import { TeamChatNotificationsListener } from '@/components/team-chat/TeamChatNotificationsListener';
import { setActiveTeamChatConversation } from '@/hooks/chat/useTeamChatNotifications';

const mensagem = (senderId: string, conversationId = 'c1') => ({
  new: {
    id: 'm1',
    conversation_id: conversationId,
    sender_id: senderId,
    content: 'oi',
    media_type: null,
    created_at: '2026-09-30T00:00:00Z',
  },
});

describe('TC-007 — listener global de notificações do Team Chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    grafo.rampas = [];
    h.profile = { id: 'eu' };
    h.channelCalls = 0;
    h.handler = null;
    h.membership = [{ id: 'm1', is_muted: false }];
    h.settings.soundEnabled = true;
    h.settings.soundVolume = 60;
    h.settings.browserNotifications = false;
    h.quiet = false;
    setActiveTeamChatConversation(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
  });

  it('alerta mesmo com a view do Team Chat desmontada (usuário em outra tela)', async () => {
    render(<TeamChatNotificationsListener />);

    expect(h.handler).toBeTruthy();
    await h.handler!(mensagem('outro', 'c1'));

    expect(grafo.rampas.length).toBeGreaterThan(0);
  });

  it('não abre canal sem usuário autenticado', () => {
    h.profile = null;

    render(<TeamChatNotificationsListener />);

    expect(h.channelCalls).toBe(0);
    expect(h.handler).toBeNull();
  });

  it('não alerta a conversa em foco publicada pela view, mas alerta as demais', async () => {
    setActiveTeamChatConversation('c1');
    render(<TeamChatNotificationsListener />);

    await h.handler!(mensagem('outro', 'c1'));
    expect(grafo.rampas).toHaveLength(0);

    await h.handler!(mensagem('outro', 'c2'));
    expect(grafo.rampas.length).toBeGreaterThan(0);
  });

  it('volta a alertar quando a view é fechada (foco limpo)', async () => {
    setActiveTeamChatConversation('c1');
    render(<TeamChatNotificationsListener />);

    act(() => { setActiveTeamChatConversation(null); });

    await h.handler!(mensagem('outro', 'c1'));
    expect(grafo.rampas.length).toBeGreaterThan(0);
  });
});
