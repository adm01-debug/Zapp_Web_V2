import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Captura as instâncias de áudio para provar o volume efetivo do alerta.
const audios: Array<{ volume: number; src?: string; play: ReturnType<typeof vi.fn> }> = [];

vi.stubGlobal(
  'Audio',
  class FakeAudio {
    volume = 1;
    currentTime = 0;
    play = vi.fn().mockResolvedValue(undefined);
    constructor(public src?: string) {
      audios.push(this as never);
    }
  },
);

vi.stubGlobal('Notification', { permission: 'default' });

// Canal do Supabase: guarda o callback de `postgres_changes` para disparar o alerta no teste.
let handler: ((payload: unknown) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const canal: Record<string, unknown> = {};
  canal.on = (_evt: string, _cfg: unknown, cb: (p: unknown) => void) => {
    handler = cb;
    return canal;
  };
  canal.subscribe = () => ({ unsubscribe: vi.fn() });
  return {
    supabase: {
      channel: () => canal,
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: { soundVolume: 60 } }),
}));

import { useTeamChatNotifications } from '@/hooks/team-chat/useTeamChatNotifications';

describe('useTeamChatNotifications — som de alerta', () => {
  beforeEach(() => {
    audios.length = 0;
    handler = null;
  });

  it('toca com o volume do painel (60 -> 0.6) ao chegar mensagem de outro usuário', () => {
    renderHook(() =>
      useTeamChatNotifications({ conversationId: 'c1', currentUserId: 'eu' }),
    );

    expect(handler).toBeTruthy();
    handler!({ new: { sender_id: 'outro', content: 'oi' } });

    expect(audios).toHaveLength(1);
    expect(audios[0].volume).toBeCloseTo(0.6, 5);
    expect(audios[0].play).toHaveBeenCalled();
  });

  it('não toca a própria mensagem', () => {
    renderHook(() =>
      useTeamChatNotifications({ conversationId: 'c1', currentUserId: 'eu' }),
    );
    handler!({ new: { sender_id: 'eu', content: 'minha' } });

    expect(audios[0].play).not.toHaveBeenCalled();
  });

  it('respeita o mudo do atendente', () => {
    renderHook(() =>
      useTeamChatNotifications({ conversationId: 'c1', currentUserId: 'eu', muted: true }),
    );
    handler!({ new: { sender_id: 'outro', content: 'oi' } });

    expect(audios[0].play).not.toHaveBeenCalled();
  });
});
