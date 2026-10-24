import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ─── Grafo WebAudio falso: o hook de PRODUÇÃO toca por osciladores (não por <audio>).
// Antes este teste exercitava `src/hooks/team-chat/useTeamChatNotifications.ts`, um hook
// MORTO (não exportado pelo barrel, sem nenhum consumidor em produção) que tocava
// `/sounds/message.mp3` — arquivo que nunca existiu em `public/`. O teste passava verde
// cobrindo um caminho que nunca rodava no app: o alerta real é o de `@/hooks/chat`.
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

vi.stubGlobal('AudioContext', FakeAudioContext);

const h = vi.hoisted(() => ({
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
  // O hook faz .from('team_conversation_members').select(...).eq(...).eq(...).limit(1)
  const consulta: Record<string, unknown> = {};
  consulta.select = () => consulta;
  consulta.eq = () => consulta;
  consulta.limit = () => Promise.resolve({ data: h.membership, error: null });
  return {
    supabase: {
      channel: () => canal,
      removeChannel: vi.fn(),
      from: () => consulta,
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
  usePushNotifications: () => ({ showNotification: vi.fn(), isSubscribed: false, permission: 'default' }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

import { useTeamChatNotifications } from '@/hooks/chat/useTeamChatNotifications';

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

describe('useTeamChatNotifications (produção) — som de alerta', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    grafo.rampas = [];
    h.handler = null;
    h.membership = [{ id: 'm1', is_muted: false }];
    h.settings.soundEnabled = true;
    h.settings.soundVolume = 60;
    h.settings.browserNotifications = false;
    h.quiet = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('toca com o volume do painel (60 -> ganho 0.12) ao chegar mensagem de outro usuário', async () => {
    renderHook(() => useTeamChatNotifications(null));

    expect(h.handler).toBeTruthy();
    await h.handler!(mensagem('outro'));

    expect(grafo.rampas[0]).toBeCloseTo(0.12, 5);
  });

  it('acompanha o volume do painel: 100 -> ganho 0.2 (nunca um valor cravado)', async () => {
    h.settings.soundVolume = 100;
    renderHook(() => useTeamChatNotifications(null));
    await h.handler!(mensagem('outro'));

    expect(grafo.rampas[0]).toBeCloseTo(0.2, 5);
  });

  it('não toca a própria mensagem', async () => {
    renderHook(() => useTeamChatNotifications(null));
    await h.handler!(mensagem('eu'));

    expect(grafo.rampas).toHaveLength(0);
  });

  it('não toca quando o atendente não é membro da conversa', async () => {
    h.membership = [];
    renderHook(() => useTeamChatNotifications(null));
    await h.handler!(mensagem('outro'));

    expect(grafo.rampas).toHaveLength(0);
  });

  it('não toca quando a conversa está muda para o atendente (is_muted)', async () => {
    h.membership = [{ id: 'm1', is_muted: true }];
    renderHook(() => useTeamChatNotifications(null));
    await h.handler!(mensagem('outro'));

    expect(grafo.rampas).toHaveLength(0);
  });

  it('não toca com os alertas desligados no painel (soundEnabled=false)', async () => {
    h.settings.soundEnabled = false;
    renderHook(() => useTeamChatNotifications(null));
    await h.handler!(mensagem('outro'));

    expect(grafo.rampas).toHaveLength(0);
  });

  it('não toca em horário de silêncio (quiet hours)', async () => {
    h.quiet = true;
    renderHook(() => useTeamChatNotifications(null));
    await h.handler!(mensagem('outro'));

    expect(grafo.rampas).toHaveLength(0);
  });

  it('não toca a conversa que o atendente está vendo na tela', async () => {
    renderHook(() => useTeamChatNotifications('c1'));
    await h.handler!(mensagem('outro', 'c1'));

    expect(grafo.rampas).toHaveLength(0);
  });
});
