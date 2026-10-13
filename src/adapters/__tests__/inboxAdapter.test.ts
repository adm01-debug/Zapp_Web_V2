import { describe, expect, it } from 'vitest';
import {
  mapMessageRowToMessage,
  mapRealtimeConversationToConversation,
  resolveFirstResponseCycleStart,
  type SlaCycleRow,
} from '../inboxAdapter';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

describe('mapMessageRowToMessage', () => {
  it('hydrates a safe location object from the canonical atomic payload', () => {
    const message = mapMessageRowToMessage({
      id: 'message-1', content: JSON.stringify({ latitude: -23.5505, longitude: -46.6333, name: 'São Paulo' }),
      message_type: 'location', sender: 'agent', created_at: '2026-09-09T20:00:00.000Z',
      media_url: null, external_id: null, is_deleted: false,
    } as never);

    expect(message.location).toEqual({ latitude: -23.5505, longitude: -46.6333, name: 'São Paulo' });
  });

  it('does not render coordinates from malformed location content', () => {
    const message = mapMessageRowToMessage({
      id: 'message-2', content: '{not-json}', message_type: 'location', sender: 'agent',
      created_at: '2026-09-09T20:00:00.000Z', media_url: null, external_id: null, is_deleted: false,
    } as never);

    expect(message.location).toBeUndefined();
  });
});

// PB-34: um ciclo de SLA abre quando o cliente escreve e fecha quando um humano
// responde; a cada nova mensagem do cliente o cronometro REINICIA.
const answeredRows: SlaCycleRow[] = [
  { first_message_at: '2026-01-01T00:00:00Z', first_response_at: '2026-01-01T00:10:00Z' },
];
const openSlaRow: SlaCycleRow = { first_message_at: '2026-09-24T11:00:00Z', first_response_at: null };
const inbound = (created_at: string) => ({ sender: 'contact', created_at, status: null, is_deleted: false });
const reply = (created_at: string, status = 'sent') => ({ sender: 'agent', created_at, status, is_deleted: false });

describe('resolveFirstResponseCycleStart — ciclo aberto do cronometro (PB-34)', () => {
  it('reinicia na ultima mensagem do cliente quando ela vem depois da resposta', () => {
    const start = resolveFirstResponseCycleStart({
      slaRows: answeredRows,
      messages: [inbound('2026-01-01T00:00:00Z'), reply('2026-01-01T00:10:00Z'), inbound('2026-06-02T14:00:00Z')],
    });

    expect(start?.toISOString()).toBe('2026-06-02T14:00:00.000Z');
  });

  it('cliente respondido e sem nova mensagem: sem ciclo aberto (a tela nao mostra timer)', () => {
    const start = resolveFirstResponseCycleStart({
      slaRows: answeredRows,
      messages: [inbound('2026-01-01T00:00:00Z'), reply('2026-01-01T00:10:00Z')],
    });

    expect(start).toBeNull();
  });

  it('usa a linha ABERTA do conversation_sla quando as mensagens nao foram carregadas', () => {
    const start = resolveFirstResponseCycleStart({ slaRows: [...answeredRows, openSlaRow], messages: [] });

    expect(start?.toISOString()).toBe('2026-09-24T11:00:00.000Z');
  });

  it('linha aberta obsoleta (resposta humana posterior) nao prende o timer em ciclo antigo', () => {
    const start = resolveFirstResponseCycleStart({
      slaRows: [openSlaRow],
      messages: [inbound('2026-09-24T11:00:00Z'), reply('2026-09-24T11:10:00Z')],
    });

    expect(start).toBeNull();
  });

  it('mensagem sending/failed nao conta como resposta humana', () => {
    const start = resolveFirstResponseCycleStart({
      messages: [inbound('2026-09-24T11:00:00Z'), reply('2026-09-24T11:05:00Z', 'failed')],
    });

    expect(start?.toISOString()).toBe('2026-09-24T11:00:00.000Z');
  });
});

describe('mapRealtimeConversationToConversation — firstResponseAt por ciclo (PB-34)', () => {
  function makeRealtime(
    rows: SlaCycleRow[] | undefined,
    messages: Array<Record<string, unknown>>,
  ): ConversationWithMessages {
    return {
      contact: {
        id: 'c-1', name: 'Cliente', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        tags: [], conversation_sla: rows,
      },
      messages,
      unreadCount: 0,
      lastMessage: null,
    } as unknown as ConversationWithMessages;
  }

  it('volta a ser null quando o cliente escreve depois da ultima resposta', () => {
    const conversation = mapRealtimeConversationToConversation(makeRealtime(answeredRows, [
      inbound('2026-01-01T00:00:00Z'), reply('2026-01-01T00:10:00Z'), inbound('2026-06-02T14:00:00Z'),
    ]));

    expect(conversation.firstResponseAt).toBeNull();
  });

  it('mantem a resposta registrada quando nao ha mensagem nova do cliente', () => {
    const conversation = mapRealtimeConversationToConversation(makeRealtime(answeredRows, [
      inbound('2026-01-01T00:00:00Z'), reply('2026-01-01T00:10:00Z'),
    ]));

    expect(conversation.firstResponseAt?.toISOString()).toBe('2026-01-01T00:10:00.000Z');
  });
});
