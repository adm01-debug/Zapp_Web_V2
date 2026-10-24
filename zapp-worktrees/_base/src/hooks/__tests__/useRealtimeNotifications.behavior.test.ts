import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Comportamento (não encanamento): o alerta de mensagem precisa chegar ao som com o TIPO e o
 * VOLUME persistidos do painel, e respeitar as condições de silêncio.
 */
import { playNotificationSound, resetAlertKit, settingsCfg } from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

import { useRealtimeNotifications } from '@/hooks/realtime/useRealtimeNotifications';

const contato = { id: 'c1', name: 'Fulano', phone: '1199' } as never;

function mensagemNova(over: Record<string, unknown> = {}) {
  return { id: 'm1', contact_id: 'c2', sender: 'contact', is_read: false, content: 'oi', ...over } as never;
}

describe('useRealtimeNotifications — efeito do alerta', () => {
  beforeEach(() => {
    resetAlertKit();
    settingsCfg.messageSoundType = 'chime';
    settingsCfg.soundVolume = 55;
  });

  it('toca com o tipo e o volume persistidos do painel', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova());
    });

    expect(playNotificationSound).toHaveBeenCalledWith('message', 'chime', 55);
  });

  it('não toca o som de mensagem quando o controle "Novas Mensagens" está desligado', () => {
    settingsCfg.newMessageSound = false;
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova());
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
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

  it('para de tocar quando o horário de silêncio ABRE com a aba já aberta (não congela no mount)', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova());
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);

    // A janela abre DEPOIS do mount e sem mudar nenhum ajuste: o relógio sozinho não
    // dispara re-render. Antes, o `soundEnabledRef` guardava o valor calculado na montagem
    // ("não é silêncio" = true) e o beep continuava tocando dentro do horário de silêncio.
    settingsCfg.quietHours = true;

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova({ id: 'm2' }));
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });
});
