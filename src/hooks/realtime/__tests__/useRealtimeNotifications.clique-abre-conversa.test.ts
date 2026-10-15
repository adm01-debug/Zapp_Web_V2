import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * O aviso do sistema só serve se o clique nele levar à conversa. Ele nasce com a `tag` do
 * CONTATO — com a tag fixa ("notification") a mensagem do contato B apagava o aviso ainda não
 * lido do contato A — e com um `onClick` que usa o contrato de navegação do produto
 * (`openContactChat`: evento `open-contact-chat` para a inbox, troca de view e repetição para a
 * view ainda montando).
 */

const mockNavigateToView = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: (...args: unknown[]) => mockNavigateToView(...args),
}));

import {
  showBrowserNotification,
  resetAlertKit,
  settingsCfg,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

import { useRealtimeNotifications } from '@/hooks/realtime/useRealtimeNotifications';

const contato = { id: 'c2', name: 'Fulano', phone: '1199' } as never;
const mensagem = { id: 'm1', contact_id: 'c2', sender: 'contact', is_read: false, content: 'oi' } as never;

type OpcoesAviso = { tag?: string; onClick?: () => void };
type JanelaComPendente = Window & { __pendingOpenContactId?: string };

function opcoesDoAviso(): OpcoesAviso {
  expect(showBrowserNotification).toHaveBeenCalledTimes(1);
  return showBrowserNotification.mock.calls[0][2] as OpcoesAviso;
}

/** Monta o hook e dispara uma mensagem nova, devolvendo as opções do aviso gerado. */
function avisoDeMensagemNova(): OpcoesAviso {
  const { result } = renderHook(() => useRealtimeNotifications());
  act(() => {
    result.current.notifyAboutIncomingMessage(contato, mensagem);
  });
  return opcoesDoAviso();
}

describe('useRealtimeNotifications — aviso do sistema clicável', () => {
  beforeEach(() => {
    resetAlertKit();
    settingsCfg.browserNotifications = true;
    mockNavigateToView.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    delete (window as JanelaComPendente).__pendingOpenContactId;
    vi.useRealTimers();
  });

  it('leva a tag da conversa no lugar da tag fixa e um clique instalado', () => {
    const opcoes = avisoDeMensagemNova();

    expect(opcoes.tag).toBe('c2');
    expect(typeof opcoes.onClick).toBe('function');
  });

  it('o clique no aviso abre a conversa do contato pelo contrato do produto', async () => {
    const recebidos: string[] = [];
    const aoAbrir = (evento: Event) => {
      recebidos.push((evento as CustomEvent<{ contactId: string }>).detail.contactId);
      // A inbox confirma o consumo limpando o id pendente: é o que encerra a cadeia de repetição.
      delete (window as JanelaComPendente).__pendingOpenContactId;
    };
    window.addEventListener('open-contact-chat', aoAbrir);
    try {
      const opcoes = avisoDeMensagemNova();

      opcoes.onClick?.();

      expect(mockNavigateToView).toHaveBeenCalledWith('inbox');
      expect((window as JanelaComPendente).__pendingOpenContactId).toBe('c2');

      await act(async () => { await vi.advanceTimersByTimeAsync(200); });

      expect(recebidos).toEqual(['c2']);
    } finally {
      window.removeEventListener('open-contact-chat', aoAbrir);
    }
  });

  it('nada é avisado no sistema quando o ajuste do painel está desligado', () => {
    settingsCfg.browserNotifications = false;
    const { result } = renderHook(() => useRealtimeNotifications());

    act(() => {
      result.current.notifyAboutIncomingMessage(contato, mensagem);
    });

    expect(showBrowserNotification).not.toHaveBeenCalled();
  });
});
