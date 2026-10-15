import '@/hooks/__tests__/helpers/alertMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * O que cada canal do alerta de mensagem nova exige, e o horário de silêncio ao vivo nos TRÊS
 * canais (beep, aviso do sistema e aviso em tela).
 *
 * Os testes irmãos de `src/hooks/__tests__/useRealtimeNotifications.behavior.test.ts` cobrem o
 * gatilho (tipo/volume, mensagem minha, mensagem lida, conversa aberta) e o silêncio ao vivo do
 * BEEP; o `clique-abre-conversa.test.ts` cobre a `tag` e o `onClick`. O que faltava — e é o que
 * este arquivo tranca — é o par `soundEnabled` (chave GLOBAL de som) × `newMessageSound`
 * (controle do EVENTO "Novas Mensagens"), e o silêncio ao vivo enxergado pelos outros dois
 * canais. Sem o par, desligar o som no painel continuava apitando; sem o silêncio ao vivo no
 * aviso do sistema, uma aba aberta seguia levantando notificação do SO depois de a janela abrir.
 */

const mockNavigateToView = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (...args: unknown[]) => mockNavigateToView(...args),
}));

import {
  playNotificationSound,
  resetAlertKit,
  settingsCfg,
  showBrowserNotification,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';
import { useRealtimeNotifications } from '@/hooks/realtime/useRealtimeNotifications';

const contato = { id: 'c2', name: 'Fulano', phone: '1199' } as never;

function mensagem(id: string) {
  return { id, contact_id: 'c2', sender: 'contact', is_read: false, content: 'oi' } as never;
}

function montar() {
  const { result } = renderHook(() => useRealtimeNotifications());
  return result;
}

describe('useRealtimeNotifications — o que cada canal exige', () => {
  beforeEach(() => {
    resetAlertKit();
    mockNavigateToView.mockClear();
    // Estado explícito: o aviso em tela é o canal que o painel liga por escolha.
    settingsCfg.browserNotifications = true;
  });

  it('som GLOBAL desligado emudece o beep mesmo com "Novas Mensagens" ligado, e o aviso em tela continua', () => {
    settingsCfg.soundEnabled = false;
    settingsCfg.newMessageSound = true;
    const result = montar();

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagem('m1'));
    });

    // O par: a chave global de som E o controle do evento. `newMessageSound` sozinho não basta.
    expect(playNotificationSound).not.toHaveBeenCalled();
    // Quem governa o aviso do sistema é `browserNotifications` — desligar o som não o cala.
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
  });

  it('as duas chaves de alerta desligadas não criam nem o aviso em tela', () => {
    settingsCfg.soundEnabled = false;
    settingsCfg.browserNotifications = false;
    const result = montar();

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagem('m1'));
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(showBrowserNotification).not.toHaveBeenCalled();
    expect(result.current.newMessageNotification).toBeNull();
  });

  it('a janela de silêncio abrindo ao vivo cala o beep, o aviso do sistema e o aviso em tela', () => {
    const result = montar();

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagem('m1'));
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
    expect(result.current.newMessageNotification?.id).toBe('m1');

    // A janela abre com a aba já montada: nada no efeito depende do relógio, então o valor tem
    // de ser lido no ponto de uso.
    settingsCfg.quietHours = true;
    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagem('m2'));
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
    expect(result.current.newMessageNotification?.id).toBe('m1');
  });

  it('a janela de silêncio fechando com a aba aberta volta a avisar', () => {
    settingsCfg.quietHours = true;
    const result = montar();

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagem('m1'));
    });
    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(showBrowserNotification).not.toHaveBeenCalled();
    expect(result.current.newMessageNotification).toBeNull();

    settingsCfg.quietHours = false;
    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagem('m2'));
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
    expect(result.current.newMessageNotification?.id).toBe('m2');
  });
});
