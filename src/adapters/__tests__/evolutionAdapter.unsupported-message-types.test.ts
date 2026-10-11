/**
 * R2-INB (auditoria de paridade V3 → V2): o adaptador do banco externo
 * (evolution_messages) precisa entregar o mesmo tipo 'unsupported' com motivo que
 * o caminho real. Antes `mapMessageType` fazia `mapping[type] || 'text'` e
 * contactMessage virava 'text' — balão vazio na tela.
 */
import { describe, expect, it } from 'vitest';

import { buildExternalConversations, evolutionToRealtimeMessage } from '@/adapters/evolutionAdapter';
import type { NormalizedRealtimeMessage } from '@/hooks/realtime/realtimeUtils';
import type { EvolutionMessage } from '@/types/evolutionExternal';

function externalMessage(over: Partial<EvolutionMessage>): EvolutionMessage {
  return {
    id: 'external-row-id',
    message_id: 'evolution-message-id',
    remote_jid: '5511999999999@s.whatsapp.net',
    from_me: false,
    message_type: 'conversation',
    content: 'Olá',
    media_url: null,
    media_mimetype: null,
    media_type: null,
    media_filename: null,
    media_size: null,
    caption: null,
    quoted_message_id: null,
    is_starred: false,
    is_important: false,
    category: null,
    sentiment: null,
    tags: null,
    notes: null,
    follow_up_at: null,
    follow_up_done: false,
    payload: null,
    raw_data: null,
    created_at: '2026-09-09T22:00:00.000Z',
    contact_id: null,
    conversation_id: null,
    direction: 'inbound',
    status: 'received',
    status_at: '2026-09-09T22:00:01.000Z',
    sent_by_bot: false,
    template_name: null,
    instance_name: 'canonical-instance',
    push_name: 'Contato',
    deleted_at: null,
    ...over,
  };
}

describe('evolutionToRealtimeMessage — tipos sem renderização', () => {
  it('enquete vira unsupported/poll', () => {
    const message = evolutionToRealtimeMessage(
      externalMessage({ message_type: 'pollCreationMessage', content: 'Vamos?' }),
    );
    expect(message.message_type).toBe('unsupported');
    expect(message.unsupportedKind).toBe('poll');
  });

  it('visualização única vira unsupported/view_once', () => {
    const message = evolutionToRealtimeMessage(externalMessage({ message_type: 'viewOnceMessageV2' }));
    expect(message.message_type).toBe('unsupported');
    expect(message.unsupportedKind).toBe('view_once');
  });

  it('contato compartilhado vira unsupported/contact (antes virava text)', () => {
    const message = evolutionToRealtimeMessage(
      externalMessage({ message_type: 'contactMessage', content: '[Contato]' }),
    );
    expect(message.message_type).toBe('unsupported');
    expect(message.unsupportedKind).toBe('contact');
  });

  it('tipo desconhecido que traz conteúdo vira unsupported/other', () => {
    const message = evolutionToRealtimeMessage(
      externalMessage({ message_type: 'algumTipoNovo', content: 'conteúdo' }),
    );
    expect(message.message_type).toBe('unsupported');
    expect(message.unsupportedKind).toBe('other');
  });

  it('tipo de protocolo/controle não vira balão', () => {
    const message = evolutionToRealtimeMessage(externalMessage({ message_type: 'protocolMessage', content: '' }));
    expect(message.message_type).toBe('protocolMessage');
    expect(message.unsupportedKind).toBeUndefined();
  });

  it('ephemeralMessage com conteúdo NÃO some como controle: vira unsupported/other com content', () => {
    // Recusa rodada 1: ephemeralMessage é invólucro do modo temporário — o texto
    // é mensagem real do usuário e precisa continuar visível (fallback).
    const message = evolutionToRealtimeMessage(
      externalMessage({ message_type: 'ephemeralMessage', content: 'Oi, modo temporário' }),
    );
    expect(message.message_type).toBe('unsupported');
    expect(message.unsupportedKind).toBe('other');
    expect(message.content).toBe('Oi, modo temporário');
  });

  it('tipo desconhecido só com mídia (content vazio) vira unsupported/other', () => {
    const message = evolutionToRealtimeMessage(
      externalMessage({
        message_type: 'algumTipoNovo',
        content: null,
        caption: null,
        media_url: 'https://cdn.exemplo/x.bin',
      }),
    );
    expect(message.message_type).toBe('unsupported');
    expect(message.unsupportedKind).toBe('other');
  });

  it('mensagem de texto comum não muda', () => {
    const message = evolutionToRealtimeMessage(externalMessage({ message_type: 'conversation', content: 'Olá' }));
    expect(message.message_type).toBe('text');
    expect(message.unsupportedKind).toBeUndefined();
    expect(message.content).toBe('Olá');
  });
});

describe('buildExternalConversations — o content sobrevive ao fallback', () => {
  it('a conversa carrega a mensagem como unsupported com o content preservado', () => {
    const [conversation] = buildExternalConversations([
      externalMessage({ message_type: 'pollCreationMessage', content: 'Qual horário?' }),
    ]);

    const [message] = conversation.messages as NormalizedRealtimeMessage[];
    expect(message.message_type).toBe('unsupported');
    expect(message.unsupportedKind).toBe('poll');
    expect(message.content).toBe('Qual horário?');
  });
});
