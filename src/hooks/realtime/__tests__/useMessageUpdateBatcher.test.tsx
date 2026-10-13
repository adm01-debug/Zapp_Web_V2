/**
 * Batcher de UPDATEs do realtime (src/hooks/realtime/useMessageUpdateBatcher.ts).
 *
 * O canal manda um UPDATE por mudança de status/mensagem; aplicar cada um na hora
 * re-renderiza a lista inteira dezenas de vezes ao vivo. O batcher junta os
 * eventos de 100ms num ÚNICO commit — e, para contato que não está na lista,
 * delega ao hydrate em vez de descartar o evento.
 *
 * Provo, chamando o hook real (o normalizador real entra no caminho):
 *  - N eventos rápidos viram 1 commit, com todas as mensagens atualizadas;
 *  - o ÚLTIMO evento do mesmo id vence (o mapa é por id de mensagem);
 *  - evento de contato fora da lista chama hydrateConversationForMessage, sem commit;
 *  - evento sem contact_id é descartado (nem commit nem hydrate);
 *  - o normalizador é aplicado: `poll` cru chega como 'unsupported' na conversa;
 *  - mensagem que não existe na conversa não gera array novo (mesmo objeto).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { useMessageUpdateBatcher } from '../useMessageUpdateBatcher';
import type {
  ConversationContact,
  ConversationWithMessages,
  RealtimeMessage,
} from '../../chat/useRealtimeMessages';

const contato = (id: string): ConversationContact =>
  ({
    id,
    name: `Contato ${id}`,
    phone: '5511999999999',
    email: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
    conversation_status: 'open',
    tags: [],
    queue_id: null,
    assigned_to: null,
  }) as unknown as ConversationContact;

const mensagem = (
  id: string,
  contactId: string,
  over: Partial<RealtimeMessage> = {},
): RealtimeMessage =>
  ({
    id,
    contact_id: contactId,
    external_id: id,
    sender: 'contact',
    content: 'oi',
    message_type: 'text',
    media_url: null,
    status: 'sent',
    created_at: '2026-10-13T10:00:00.000Z',
    status_updated_at: null,
    is_read: false,
    ...over,
  }) as unknown as RealtimeMessage;

const conversa = (contactId: string, mensagens: RealtimeMessage[]): ConversationWithMessages => ({
  contact: contato(contactId),
  messages: mensagens,
  unreadCount: mensagens.filter((m) => !m.is_read && m.sender === 'contact').length,
  lastMessage: mensagens[mensagens.length - 1] ?? null,
});

const payload = (message: Partial<RealtimeMessage>) =>
  ({
    eventType: 'UPDATE',
    new: message,
    old: {},
  }) as unknown as RealtimePostgresChangesPayload<RealtimeMessage>;

function montar(inicial: ConversationWithMessages[]) {
  let conversas = inicial;
  const ref = { current: conversas };
  const commit = vi.fn(
    (updater: (prev: ConversationWithMessages[]) => ConversationWithMessages[]) => {
      conversas = updater(conversas);
      ref.current = conversas;
    },
  );
  const hydrate = vi.fn(async (_message: RealtimeMessage) => {});
  const { result } = renderHook(() => useMessageUpdateBatcher(ref, commit, hydrate));
  return { result, commit, hydrate, atual: () => conversas };
}

const avancar = async (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('useMessageUpdateBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('junta N eventos rápidos num ÚNICO commit', async () => {
    const { result, commit, atual } = montar([
      conversa('a', [mensagem('m1', 'a'), mensagem('m2', 'a'), mensagem('m3', 'a')]),
    ]);

    act(() => {
      result.current.handleMessageUpdate(payload(mensagem('m1', 'a', { content: 'editada' })));
      result.current.handleMessageUpdate(payload(mensagem('m2', 'a', { is_read: true })));
      result.current.handleMessageUpdate(payload(mensagem('m3', 'a', { status: 'delivered' })));
    });

    await avancar(150);

    expect(commit).toHaveBeenCalledTimes(1);
    const [conv] = atual();
    expect(conv.messages.map((m) => [m.id, m.content, m.is_read, m.status])).toEqual([
      ['m1', 'editada', false, 'sent'],
      ['m2', 'oi', true, 'sent'],
      ['m3', 'oi', false, 'delivered'],
    ]);
    // o commit recalcula o agregado da conversa (m1 e m3 continuam não lidas)
    expect(conv.unreadCount).toBe(2);
  });

  it('o último evento do mesmo id vence', async () => {
    const { result, commit, atual } = montar([conversa('a', [mensagem('m1', 'a')])]);

    act(() => {
      result.current.handleMessageUpdate(payload(mensagem('m1', 'a', { content: 'primeira' })));
      result.current.handleMessageUpdate(payload(mensagem('m1', 'a', { content: 'segunda' })));
    });

    await avancar(150);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(atual()[0].messages[0].content).toBe('segunda');
  });

  it('contato fora da lista delega ao hydrate, sem commit', async () => {
    const { result, commit, hydrate } = montar([conversa('a', [mensagem('m1', 'a')])]);

    act(() => {
      result.current.handleMessageUpdate(payload(mensagem('m-fora', 'z')));
    });

    await avancar(150);

    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(hydrate.mock.calls[0][0].id).toBe('m-fora');
    expect(commit).not.toHaveBeenCalled();
  });

  it('o normalizador real é aplicado: `poll` cru chega como unsupported', async () => {
    const { result, hydrate } = montar([conversa('a', [mensagem('m1', 'a')])]);

    act(() => {
      result.current.handleMessageUpdate(payload(mensagem('m-fora', 'z', { message_type: 'poll' })));
    });

    await avancar(150);

    expect(hydrate.mock.calls[0][0].message_type).toBe('unsupported');
  });

  it('evento sem contact_id é descartado', async () => {
    const { result, commit, hydrate } = montar([conversa('a', [mensagem('m1', 'a')])]);

    act(() => {
      result.current.handleMessageUpdate(
        payload(mensagem('m-orfa', 'a', { contact_id: null as unknown as string })),
      );
    });

    await avancar(150);

    expect(commit).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });

  it('mensagem que não existe na conversa não gera array novo', async () => {
    const inicial = [conversa('a', [mensagem('m1', 'a')])];
    const { result, commit, atual } = montar(inicial);

    act(() => {
      result.current.handleMessageUpdate(payload(mensagem('m-inexistente', 'a')));
    });

    await avancar(150);

    expect(commit).toHaveBeenCalledTimes(1);
    // identidade preservada: o updater devolveu o MESMO prev (sem re-render)
    expect(atual()).toBe(inicial);
  });
});
