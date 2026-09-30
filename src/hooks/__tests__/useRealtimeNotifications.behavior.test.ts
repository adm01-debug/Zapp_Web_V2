import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Comportamento (não encanamento): o alerta de mensagem precisa chegar ao som com o TIPO e o
 * VOLUME persistidos do painel. O teste antigo deste hook cobria só a inscrição no canal.
 */
const playNotificationSound = vi.fn();

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: (...args: unknown[]) => playNotificationSound(...args),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      browserNotifications: false,
      messageSoundType: 'chime',
      soundVolume: 55,
      slaSoundType: 'alert',
      mentionSoundType: 'ping',
      transcriptionSoundType: 'soft',
    },
    isQuietHours: () => false,
  }),
}));

import { useRealtimeNotifications } from '@/hooks/realtime/useRealtimeNotifications';

const contato = { id: 'c1', name: 'Fulano', phone: '1199' } as never;

function mensagemNova(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    contact_id: 'c2',
    sender: 'contact',
    is_read: false,
    content: 'oi',
    ...over,
  } as never;
}

describe('useRealtimeNotifications — efeito do alerta', () => {
  beforeEach(() => {
    playNotificationSound.mockClear();
  });

  it('toca com o tipo e o volume persistidos do painel', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova());
    });

    expect(playNotificationSound).toHaveBeenCalledWith('message', 'chime', 55);
  });

  it('não toca mensagem enviada por mim', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova({ sender: 'me' }));
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca mensagem já lida', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova({ is_read: true }));
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('não toca a conversa que está aberta na tela', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.setSelectedContact('c2');
    });
    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova({ contact_id: 'c2' }));
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
