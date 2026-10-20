/**
 * R2-INB-059 — o aviso de mensagem nova precisa saber qual conversa está aberta
 * em TODOS os caminhos que trocam a seleção, não só em `handleSelectConversation`.
 *
 * O contato que suprime som/toast vive no ref de `setSelectedContact`
 * (`useRealtimeNotifications`), alimentado pelo id selecionado. Estes testes
 * dirigem o hook REAL pela troca do id — os caminhos que só chamam
 * `setSelectedContactId` (nova conversa criada pelo modal e "Voltar" no celular,
 * que passa `null`) — e observam o efeito no notificador REAL.
 */
import '@/hooks/__tests__/helpers/alertMocks';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const ui = vi.hoisted(() => ({ selectedContactId: null as string | null }));
const spies = vi.hoisted(() => ({
  markAsRead: vi.fn().mockResolvedValue(undefined),
  setSelectedContact: vi.fn(),
  notifier: null as null | {
    notifyAboutIncomingMessage: (contact: unknown, message: unknown) => void;
    setSelectedContact: (contactId: string | null) => void;
  },
}));

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: ui.selectedContactId,
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: vi.fn(),
  }),
}));

vi.mock('@/hooks/chat/useRealtimeMessages', async () => {
  const notif = await vi.importActual<
    typeof import('@/hooks/realtime/useRealtimeNotifications')
  >('@/hooks/realtime/useRealtimeNotifications');
  return {
    useRealtimeMessages: () => {
      const n = notif.useRealtimeNotifications();
      spies.notifier = n as unknown as typeof spies.notifier;
      return {
        conversations: [],
        loading: false,
        error: null,
        sendMessage: vi.fn(),
        markAsRead: spies.markAsRead,
        refetch: vi.fn(),
        newMessageNotification: n.newMessageNotification,
        dismissNotification: n.dismissNotification,
        setSelectedContact,
        setSoundEnabled: n.setSoundEnabled,
      };
    },
  };
});

// Ponte estável entre o hook e o notificador REAL: registra a chamada (prova de
// que o ref é alimentado em todos os caminhos) e repassa o id ao notificador.
function setSelectedContact(contactId: string | null) {
  spies.setSelectedContact(contactId);
  spies.notifier?.setSelectedContact(contactId);
}

vi.mock('@/hooks/integrations/useExternalEvolution', () => ({
  useExternalConversations: () => ({ conversations: [], loading: false, error: null, refetch: vi.fn() }),
  useExternalMessages: () => ({ messages: [], loading: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({ conversations: [], usingCache: false }),
}));
vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(),
  }),
}));

import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';
import {
  playNotificationSound,
  resetAlertKit,
} from '@/hooks/__tests__/helpers/alertBehaviorTestKit';

const contato = (id: string) => ({ id, name: 'Fulano', avatar_url: null }) as never;
const mensagem = (contactId: string, id: string) =>
  ({ id, contact_id: contactId, sender: 'contact', is_read: false, content: 'oi' }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  resetAlertKit();
  spies.markAsRead.mockResolvedValue(undefined);
});

describe('useRealtimeInbox — o aviso conhece a conversa aberta (R2-INB-059)', () => {
  it('voltar (null) devolve o aviso ao contato que estava aberto, sem chamada duplicada', () => {
    ui.selectedContactId = 'c1';
    const { rerender } = renderHook(() => useRealtimeInbox());

    // Conversa aberta: o aviso dela é suprimido.
    act(() => {
      spies.notifier!.notifyAboutIncomingMessage(contato('c1'), mensagem('c1', 'm1'));
    });
    expect(playNotificationSound).not.toHaveBeenCalled();

    // "Voltar" no celular: só o id é trocado por `null`.
    ui.selectedContactId = null;
    rerender();

    act(() => {
      spies.notifier!.notifyAboutIncomingMessage(contato('c1'), mensagem('c1', 'm2'));
    });
    expect(playNotificationSound).toHaveBeenCalledTimes(1);

    // O ref segue o id exatamente uma vez por troca: nada de chamada manual extra.
    expect(spies.setSelectedContact.mock.calls.map((c) => c[0])).toEqual(['c1', null]);
  });

  it('abrir pela nova conversa suprime o aviso e marca como lida', () => {
    ui.selectedContactId = null;
    const { rerender } = renderHook(() => useRealtimeInbox());
    spies.markAsRead.mockClear();

    // Caminho do modal: o id novo chega direto, sem passar por `handleSelectConversation`.
    ui.selectedContactId = 'c-new';
    rerender();

    expect(spies.setSelectedContact).toHaveBeenLastCalledWith('c-new');
    expect(spies.markAsRead).toHaveBeenCalledWith('c-new');

    act(() => {
      spies.notifier!.notifyAboutIncomingMessage(contato('c-new'), mensagem('c-new', 'm1'));
    });
    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
