/**
 * Paridade V3 -> V2 (doc 06) — funções PURAS de `realtimeUtils`.
 *
 * A V2 testava só `classifyMessageType` (messageTypeClassification.test.ts); a
 * montagem da conversa ("build*") e os utilitários de lista não tinham trava. Aqui
 * os contratos com defeito conhecido ficam presos: `status`/`status_updated_at`
 * ganham default (senão a bolha perde o tick), a contagem de não lidas só conta
 * mensagem do CONTATO não lida, a ordenação é crescente por `created_at`, e o
 * agregado do banco (R2-INB-005) só cobre o contato que ficou FORA da amostra
 * global de mensagens.
 */
import { describe, it, expect } from 'vitest';

import {
  normalizeMessage,
  sortMessagesByCreatedAt,
  buildConversation,
  buildConversations,
  dedupeContacts,
  getUniqueMessageContactIds,
  chunkArray,
} from '@/hooks/realtime/realtimeUtils';
import type { ContactConversationSummary } from '@/hooks/realtime/realtimeUtils';
import type {
  RealtimeMessage,
  ConversationContact,
} from '@/hooks/chat/useRealtimeMessages';

function msg(over: Partial<RealtimeMessage> & { id: string }): RealtimeMessage {
  return {
    contact_id: 'c1',
    sender: 'contact',
    content: 'texto',
    message_type: 'text',
    media_url: null,
    status: 'sent',
    created_at: '2026-10-11T10:00:00.000Z',
    status_updated_at: null,
    is_read: true,
    ...over,
  } as unknown as RealtimeMessage;
}

function contact(id: string, created_at = '2026-10-11T09:00:00.000Z'): ConversationContact {
  return { id, name: id, created_at } as unknown as ConversationContact;
}

describe('realtimeUtils — normalização da mensagem', () => {
  it('preenche status/default de status_updated_at sem sobrescrever o que veio', () => {
    const semStatus = normalizeMessage(
      msg({ id: 'm1', status: undefined, status_updated_at: undefined }),
    );
    expect(semStatus.status).toBe('sent');
    expect(semStatus.status_updated_at).toBeNull();

    const comStatus = normalizeMessage(
      msg({ id: 'm2', status: 'delivered', status_updated_at: '2026-10-11T10:05:00.000Z' }),
    );
    expect(comStatus.status).toBe('delivered');
    expect(comStatus.status_updated_at).toBe('2026-10-11T10:05:00.000Z');
  });

  it('traduz tipo cru sem suporte para unsupported carregando o motivo', () => {
    const normalizada = normalizeMessage(msg({ id: 'm3', message_type: 'pollCreationMessage' }));
    expect(normalizada.message_type).toBe('unsupported');
    expect(normalizada.unsupportedKind).toBe('poll');
  });
});

describe('realtimeUtils — ordenação', () => {
  it('ordena por created_at crescente sem mutar o array recebido', () => {
    const entrada = [
      msg({ id: 'b', created_at: '2026-10-11T12:00:00.000Z' }),
      msg({ id: 'a', created_at: '2026-10-11T10:00:00.000Z' }),
      msg({ id: 'c', created_at: '2026-10-11T11:00:00.000Z' }),
    ];
    const copia = [...entrada];
    const ordenado = sortMessagesByCreatedAt(entrada);

    expect(ordenado.map((m) => m.id)).toEqual(['a', 'c', 'b']);
    expect(entrada).toEqual(copia); // o array de entrada não foi reordenado
  });
});

describe('realtimeUtils — buildConversation', () => {
  it('conta não lidas só de mensagem do CONTATO e aponta a última mensagem', () => {
    const conversa = buildConversation(contact('c1'), [
      msg({ id: 'm1', created_at: '2026-10-11T10:00:00.000Z', sender: 'contact', is_read: false }),
      msg({ id: 'm2', created_at: '2026-10-11T11:00:00.000Z', sender: 'agent', is_read: false }),
      msg({ id: 'm3', created_at: '2026-10-11T12:00:00.000Z', sender: 'contact', is_read: true }),
    ]);

    // m2 é do agente (não conta) e m3 já está lida -> só m1 entra.
    expect(conversa.unreadCount).toBe(1);
    expect(conversa.lastMessage?.id).toBe('m3');
    expect(conversa.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('usa o agregado do banco quando o contato ficou fora da amostra (R2-INB-005)', () => {
    const summary: ContactConversationSummary = {
      unreadCount: 4,
      lastMessage: msg({ id: 'ultima', created_at: '2026-10-11T13:00:00.000Z' }),
    };

    const conversa = buildConversation(contact('c1'), [], summary);

    expect(conversa.messages.map((m) => m.id)).toEqual(['ultima']);
    expect(conversa.lastMessage?.id).toBe('ultima');
    expect(conversa.unreadCount).toBe(4); // veio do banco, não da filtragem local
  });

  it('ignora o agregado quando já existe amostra local do contato', () => {
    const summary: ContactConversationSummary = {
      unreadCount: 99,
      lastMessage: msg({ id: 'nao-usada' }),
    };

    const conversa = buildConversation(
      contact('c1'),
      [msg({ id: 'local', is_read: false, sender: 'contact' })],
      summary,
    );

    expect(conversa.messages.map((m) => m.id)).toEqual(['local']);
    expect(conversa.unreadCount).toBe(1);
  });

  it('sem amostra e sem agregado devolve conversa vazia e zero não lidas', () => {
    const conversa = buildConversation(contact('c1'), []);
    expect(conversa.messages).toEqual([]);
    expect(conversa.lastMessage).toBeNull();
    expect(conversa.unreadCount).toBe(0);
  });
});

describe('realtimeUtils — buildConversations', () => {
  it('deduplica contatos, agrupa por contato e ordena pela última mensagem', () => {
    const contatos = [contact('c1'), contact('c2'), contact('c1')]; // c1 repetido
    const mensagens = [
      msg({ id: 'm1', contact_id: 'c1', created_at: '2026-10-11T10:00:00.000Z' }),
      msg({ id: 'm2', contact_id: 'c2', created_at: '2026-10-11T12:00:00.000Z' }),
      msg({ id: 'sem-contato', contact_id: '' as unknown as string }), // descartada
    ];

    const conversas = buildConversations(contatos, mensagens);

    expect(conversas.map((c) => c.contact.id)).toEqual(['c2', 'c1']);
    expect(conversas[0].messages.map((m) => m.id)).toEqual(['m2']);
    expect(conversas[1].messages.map((m) => m.id)).toEqual(['m1']);
  });
});

describe('realtimeUtils — utilitários de lista', () => {
  it('dedupeContacts mantém a última ocorrência do id', () => {
    const primeira = { id: 'c1', name: 'Antigo' } as unknown as ConversationContact;
    const segunda = { id: 'c1', name: 'Novo' } as unknown as ConversationContact;
    const outros = { id: 'c2', name: 'Outro' } as unknown as ConversationContact;

    const dedupe = dedupeContacts([primeira, segunda, outros]);

    expect(dedupe).toHaveLength(2);
    expect(dedupe.find((c) => c.id === 'c1')?.name).toBe('Novo');
  });

  it('getUniqueMessageContactIds é único e descarta contato vazio', () => {
    const ids = getUniqueMessageContactIds([
      msg({ id: 'm1', contact_id: 'c1' }),
      msg({ id: 'm2', contact_id: 'c2' }),
      msg({ id: 'm3', contact_id: 'c1' }),
      msg({ id: 'm4', contact_id: '' }),
      msg({ id: 'm5', contact_id: null as unknown as string }),
    ]);

    expect(ids).toEqual(['c1', 'c2']);
  });

  it('chunkArray fatia pelo tamanho, incluindo o resto, e trata vazio', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
  });
});
