/**
 * Montagem das conversas da inbox (src/hooks/realtime/realtimeUtils.ts).
 *
 * Estas funções decidem o que a lista mostra: quem entra (dedupe de contato),
 * em que ordem (última mensagem), quantas não lidas e se a conversa fica vazia.
 * Um erro aqui não estoura tela — a conversa desaparece ou o contador diverge.
 *
 * Provo, chamando o módulo real:
 *  - dedupeContacts mantém a ÚLTIMA versão do contato e a ordem da 1ª aparição;
 *  - chunkArray respeita o teto por bloco e preserva a ordem (blocos do `.in()`);
 *  - buildConversation ordena por created_at, conta não lidas SÓ do contato e usa
 *    o agregado do banco quando a amostra global não trouxe nada (R2-INB-005) —
 *    e NÃO deixa o agregado sobrescrever uma amostra que existe;
 *  - buildConversations agrupa por contato, descarta mensagem sem contato e
 *    ordena pela última mensagem (contato sem mensagem usa created_at).
 */
import { describe, expect, it } from 'vitest';

import {
  buildConversation,
  buildConversations,
  chunkArray,
  dedupeContacts,
  type ContactConversationSummary,
} from '../realtimeUtils';
import type {
  ConversationContact,
  RealtimeMessage,
} from '../../chat/useRealtimeMessages';

const contato = (id: string, over: Partial<ConversationContact> = {}): ConversationContact =>
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
    ...over,
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

const resumo = (lastMessage: RealtimeMessage, unreadCount: number): ContactConversationSummary => ({
  unreadCount,
  lastMessage,
});

describe('dedupeContacts', () => {
  it('colisão de id mantém a ÚLTIMA versão e a ordem da 1ª aparição', () => {
    const antigo = contato('a', { name: 'Nome antigo' });
    const novo = contato('a', { name: 'Nome novo' });
    const b = contato('b');

    const saida = dedupeContacts([antigo, b, novo]);

    expect(saida.map((c) => c.id)).toEqual(['a', 'b']);
    expect(saida[0].name).toBe('Nome novo');
    expect(saida).toHaveLength(2);
  });

  it('lista vazia continua vazia', () => {
    expect(dedupeContacts([])).toEqual([]);
  });
});

describe('chunkArray', () => {
  it('quebra no teto do `.in()` preservando a ordem', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    const blocos = chunkArray(ids, 100);

    expect(blocos.map((bloco) => bloco.length)).toEqual([100, 100, 50]);
    expect(blocos.flat()).toEqual(ids);
  });

  it('lista menor que o teto vira um bloco só; lista vazia não gera bloco', () => {
    expect(chunkArray(['a', 'b'], 100)).toEqual([['a', 'b']]);
    expect(chunkArray([], 100)).toEqual([]);
  });
});

describe('buildConversation', () => {
  it('ordena por created_at e conta não lidas só do contato', () => {
    const antigaLida = mensagem('m1', 'a', {
      created_at: '2026-10-13T09:00:00.000Z',
      is_read: true,
    });
    const naoLida = mensagem('m2', 'a', { created_at: '2026-10-13T11:00:00.000Z' });
    const doAgente = mensagem('m3', 'a', {
      created_at: '2026-10-13T12:00:00.000Z',
      sender: 'agent',
      is_read: false,
    });

    const conversa = buildConversation(contato('a'), [doAgente, antigaLida, naoLida]);

    expect(conversa.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    // a mensagem do agente não conta como não lida do contato
    expect(conversa.unreadCount).toBe(1);
    expect(conversa.lastMessage?.id).toBe('m3');
  });

  it('amostra global vazia usa o agregado do banco: a conversa NÃO fica vazia (R2-INB-005)', () => {
    const ultima = mensagem('m-fora-da-janela', 'b', { created_at: '2026-10-12T08:00:00.000Z' });

    const conversa = buildConversation(contato('b'), [], resumo(ultima, 7));

    expect(conversa.messages.map((m) => m.id)).toEqual(['m-fora-da-janela']);
    expect(conversa.unreadCount).toBe(7);
    expect(conversa.lastMessage?.id).toBe('m-fora-da-janela');
  });

  it('agregado NÃO sobrescreve a amostra que existe', () => {
    const naoLida = mensagem('m1', 'a', { created_at: '2026-10-13T11:00:00.000Z' });
    const agregado = resumo(mensagem('m-old', 'a'), 99);

    const conversa = buildConversation(contato('a'), [naoLida], agregado);

    expect(conversa.messages.map((m) => m.id)).toEqual(['m1']);
    expect(conversa.unreadCount).toBe(1);
  });

  it('contato sem histórico de verdade (sem amostra e sem agregado) fica vazio', () => {
    const conversa = buildConversation(contato('c'), [], null);

    expect(conversa.messages).toEqual([]);
    expect(conversa.unreadCount).toBe(0);
    expect(conversa.lastMessage).toBeNull();
  });
});

describe('buildConversations', () => {
  it('agrupa por contato, deduplica contatos e ignora mensagem sem contato', () => {
    const semContato = mensagem('solto', '', { contact_id: null as unknown as string });

    const conversas = buildConversations(
      [contato('a'), contato('b'), contato('a', { name: 'A de novo' })],
      [
        mensagem('a1', 'a', { created_at: '2026-10-13T09:00:00.000Z' }),
        mensagem('b1', 'b', { created_at: '2026-10-13T11:00:00.000Z' }),
        mensagem('a2', 'a', { created_at: '2026-10-13T10:00:00.000Z' }),
        semContato,
      ],
    );

    expect(conversas).toHaveLength(2);
    expect(conversas[0].contact.id).toBe('b');
    expect(conversas[1].contact.id).toBe('a');
    expect(conversas[1].messages.map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(conversas[1].contact.name).toBe('A de novo');
  });

  it('ordena pela última mensagem; contato sem mensagem usa created_at do contato', () => {
    const semMensagem = contato('sem-msg', { created_at: '2026-10-13T13:00:00.000Z' });

    const conversas = buildConversations(
      [contato('a'), semMensagem],
      [mensagem('a1', 'a', { created_at: '2026-10-13T09:00:00.000Z' })],
    );

    expect(conversas.map((c) => c.contact.id)).toEqual(['sem-msg', 'a']);
    expect(conversas[0].lastMessage).toBeNull();
  });

  it('usa o agregado só para o contato que não tem amostra', () => {
    const ultimaB = mensagem('b-fora', 'b', { created_at: '2026-10-12T08:00:00.000Z' });
    const summaries = new Map<string, ContactConversationSummary>([
      ['b', resumo(ultimaB, 3)],
      ['a', resumo(mensagem('a-fake', 'a'), 99)],
    ]);

    const conversas = buildConversations(
      [contato('a'), contato('b')],
      [mensagem('a1', 'a', { created_at: '2026-10-13T11:00:00.000Z' })],
      summaries,
    );

    const porId = Object.fromEntries(conversas.map((c) => [c.contact.id, c]));
    expect(porId.a.messages.map((m) => m.id)).toEqual(['a1']);
    expect(porId.a.unreadCount).toBe(1);
    expect(porId.b.messages.map((m) => m.id)).toEqual(['b-fora']);
    expect(porId.b.unreadCount).toBe(3);
  });
});
