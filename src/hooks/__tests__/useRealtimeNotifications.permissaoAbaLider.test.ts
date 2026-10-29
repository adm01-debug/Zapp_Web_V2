import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Comportamento (não encanamento) de duas regras de convivência do alerta de mensagem:
 * 1. a permissão de notificação do navegador NUNCA é pedida sem gesto do usuário
 *    (era pedida na montagem do hook);
 * 2. com o Zapp aberto em várias abas, só UMA toca o som e mostra o aviso do navegador —
 *    as outras seguem atualizando o aviso em tela (contador/lista).
 */
import {
  playNotificationSound,
  showBrowserNotification,
  requestNotificationPermission,
  resetAlertKit,
  settingsCfg,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

import { useRealtimeNotifications } from '@/hooks/realtime/useRealtimeNotifications';

const contato = { id: 'c1', name: 'Fulano', phone: '1199' } as never;

function mensagemNova(over: Record<string, unknown> = {}) {
  return { id: 'm1', contact_id: 'c2', sender: 'contact', is_read: false, content: 'oi', ...over } as never;
}

/**
 * Web Locks de mentira, com a mesma semântica do navegador para o que este hook usa:
 * um dono por nome de lock; quem chega depois entra na fila e só é chamado quando o
 * dono atual solta o lock. É isso que faz a segunda "aba" ficar como seguidora.
 */
class FakeWebLocks {
  private readonly donos = new Set<string>();
  private readonly fila = new Map<string, Array<() => void>>();

  request(name: string, callback: () => Promise<unknown>): Promise<void> {
    return new Promise<void>((resolve) => {
      const tentar = () => {
        if (this.donos.has(name)) {
          const espera = this.fila.get(name) ?? [];
          espera.push(tentar);
          this.fila.set(name, espera);
          return;
        }
        this.donos.add(name);
        void Promise.resolve()
          .then(callback)
          .catch(() => undefined)
          .finally(() => {
            this.donos.delete(name);
            const espera = this.fila.get(name) ?? [];
            const proximo = espera.shift();
            if (proximo) proximo();
            resolve();
          });
      };
      tentar();
    });
  }
}

function instalarLocks() {
  Object.defineProperty(navigator, 'locks', { value: new FakeWebLocks(), configurable: true });
}

/** Deixa a fila de microtarefas do lock correr (concessão/repassse são assíncronos). */
async function liberarMicrotarefas() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useRealtimeNotifications — permissão e aba líder', () => {
  beforeEach(() => {
    resetAlertKit();
    requestNotificationPermission.mockClear();
    settingsCfg.browserNotifications = true;
    settingsCfg.newMessageSound = true;
    settingsCfg.soundEnabled = true;
  });

  afterEach(() => {
    delete (navigator as { locks?: unknown }).locks;
  });

  it('não pede a permissão de notificação na montagem do hook', () => {
    renderHook(() => useRealtimeNotifications());

    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('não pede a permissão ao chegar mensagem nova (o pedido é só do botão das configurações)', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova());
    });

    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('com duas abas abertas, só a aba líder toca o som e mostra o aviso do navegador', async () => {
    instalarLocks();
    const abaA = renderHook(() => useRealtimeNotifications());
    await liberarMicrotarefas();
    const abaB = renderHook(() => useRealtimeNotifications());
    await liberarMicrotarefas();

    act(() => {
      abaA.result.current.notifyAboutIncomingMessage(contato, mensagemNova({ id: 'a' }));
      abaB.result.current.notifyAboutIncomingMessage(contato, mensagemNova({ id: 'b' }));
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
    // As DUAS abas seguem atualizando o aviso em tela: o gate da aba líder é só do som e
    // do aviso do navegador, não do contador/lista que a tela mostra.
    expect(abaA.result.current.newMessageNotification).not.toBeNull();
    expect(abaB.result.current.newMessageNotification).not.toBeNull();
  });

  it('quando a aba líder fecha, a seguidora assume e volta a tocar', async () => {
    instalarLocks();
    const abaA = renderHook(() => useRealtimeNotifications());
    await liberarMicrotarefas();
    const abaB = renderHook(() => useRealtimeNotifications());
    await liberarMicrotarefas();

    abaA.unmount();
    await liberarMicrotarefas();

    act(() => {
      abaB.result.current.notifyAboutIncomingMessage(contato, mensagemNova({ id: 'c' }));
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
  });

  it('sem Web Locks (navegador antigo/aba única) o alerta continua tocando', () => {
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagemNova());
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
  });
});
