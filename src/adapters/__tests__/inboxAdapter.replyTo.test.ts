import { describe, expect, it } from 'vitest';
import { mapMessageRowToMessage, resolveReplyTo, withResolvedReplies } from '../inboxAdapter';
import type { Message, MessageRow } from '@/types/chat';

// #411 — a mensagem citada (`reply_to_id`) não era resolvida em nenhum ponto da
// montagem da lista: `MessageBubble` nunca recebia `replyTo` e o balão exibia a
// resposta sem a citação. O resolver preenche `replyTo` a partir do índice das
// mensagens JÁ CARREGADAS — nunca com uma consulta nova por mensagem.

const T0 = Date.parse('2026-01-01T10:00:00Z');

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    contact_id: 'contact-1',
    content: 'oi',
    sender: 'contact',
    created_at: new Date(T0).toISOString(),
    message_type: 'chat',
    media_url: null,
    status: 'sent',
    reply_to_id: null,
    ...overrides,
  } as MessageRow;
}

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    content: `conteudo ${id}`,
    sender: 'contact',
    timestamp: new Date(T0),
    created_at: new Date(T0).toISOString(),
    type: 'text',
    ...overrides,
  };
}

describe('resolveReplyTo', () => {
  it('responde a citação com conteudo e remetente da mensagem ja carregada, sem consultar nada', () => {
    const index = new Map<string, Message>([
      ['citada', message('citada', { content: 'texto original', sender: 'agent', type: 'text' })],
    ]);

    expect(resolveReplyTo('citada', index)).toEqual({
      messageId: 'citada',
      content: 'texto original',
      sender: 'agent',
      type: 'text',
    });
  });

  it('devolve o tipo da citada quando ela e midia (o balao mostra o rotulo certo)', () => {
    const index = new Map<string, Message>([
      ['foto', message('foto', { content: '', sender: 'agent', type: 'image' })],
    ]);

    expect(resolveReplyTo('foto', index)?.type).toBe('image');
  });

  it('nao quebra nem mente quando a citada esta fora da lista carregada', () => {
    const index = new Map<string, Message>([['m1', message('m1')]]);

    expect(resolveReplyTo('mais-antiga-que-a-pagina', index)).toBeUndefined();
    expect(resolveReplyTo(null, index)).toBeUndefined();
    expect(resolveReplyTo(undefined, index)).toBeUndefined();
    expect(resolveReplyTo('m1', undefined)).toBeUndefined();
  });
});

describe('withResolvedReplies', () => {
  it('preenche replyTo de quem cita uma mensagem da propria lista', () => {
    const citada = message('citada', { content: 'pergunta do cliente', sender: 'contact' });
    const resposta = message('resposta', { sender: 'agent', reply_to_id: 'citada' });

    const [a, b] = withResolvedReplies([citada, resposta]);

    expect(a.replyTo).toBeUndefined();
    expect(b.replyTo).toEqual({
      messageId: 'citada',
      content: 'pergunta do cliente',
      sender: 'contact',
      type: 'text',
    });
  });

  it('nao inventa citacao para id ausente e devolve a lista inteira e na ordem', () => {
    const lista = [
      message('m1'),
      message('m2', { reply_to_id: 'fantasma' }),
      message('m3'),
    ];

    const saida = withResolvedReplies(lista);

    expect(saida.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(saida[1].replyTo).toBeUndefined();
  });

  it('preserva o replyTo que ja existia quando o id auxiliar nao resolve', () => {
    const comCitacaoOtimista = message('m1', {
      reply_to_id: 'fantasma',
      replyTo: { messageId: 'x', content: 'otimista', sender: 'agent' },
    });

    const [saida] = withResolvedReplies([comCitacaoOtimista]);

    expect(saida.replyTo).toEqual({ messageId: 'x', content: 'otimista', sender: 'agent' });
  });
});

describe('mapMessageRowToMessage e a resolucao da citacao', () => {
  it('mantem o reply_to_id da linha para a resolucao em nivel de lista', () => {
    const rowCitando = row({ id: 'm2', reply_to_id: 'm1' });
    const citada = mapMessageRowToMessage(row({ id: 'm1', content: 'original' }));
    const citante = mapMessageRowToMessage(rowCitando);

    expect(citante.reply_to_id).toBe('m1');
    expect(citante.replyTo).toBeUndefined();

    const [resolvida] = withResolvedReplies([citada, citante].filter((m) => m.id === 'm2'));
    // sozinha a citante nao resolve (a citada nao esta na lista passada);
    // o teste da lista completa e o do hook useMessages.
    expect(resolvida.replyTo).toBeUndefined();
  });
});
