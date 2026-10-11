/**
 * R2-INB (auditoria de paridade V3 → V2): `message_type` cru do WhatsApp que a V2
 * não renderiza precisa chegar à UI como 'unsupported' com o motivo — antes o tipo
 * caía como veio e a bolha ficava vazia.
 */
import { describe, expect, it } from 'vitest';

import { classifyMessageType, normalizeMessage } from '@/hooks/realtime/realtimeUtils';
import type { RealtimeMessage } from '@/hooks/chat/useRealtimeMessages';

function realtimeMessage(
  message_type: string,
  content = '',
  media_url: string | null = null,
): RealtimeMessage {
  return {
    id: 'm1',
    contact_id: 'c1',
    sender: 'contact',
    content,
    message_type,
    media_url,
    status: 'sent',
    created_at: '2026-10-11T10:00:00.000Z',
    status_updated_at: null,
  } as unknown as RealtimeMessage;
}

describe('classifyMessageType', () => {
  it('enquete vira unsupported/poll', () => {
    expect(classifyMessageType('pollCreationMessage', true)).toMatchObject({
      messageType: 'unsupported',
      unsupportedKind: 'poll',
    });
    expect(classifyMessageType('poll', true)).toMatchObject({
      messageType: 'unsupported',
      unsupportedKind: 'poll',
    });
  });

  it('visualização única vira unsupported/view_once', () => {
    expect(classifyMessageType('viewOnceMessageV2', true)).toMatchObject({
      messageType: 'unsupported',
      unsupportedKind: 'view_once',
    });
    expect(classifyMessageType('viewOnceMessage', true)).toMatchObject({
      messageType: 'unsupported',
      unsupportedKind: 'view_once',
    });
  });

  it('contato compartilhado vira unsupported/contact', () => {
    expect(classifyMessageType('contactMessage', true)).toMatchObject({
      messageType: 'unsupported',
      unsupportedKind: 'contact',
    });
    expect(classifyMessageType('contactsArrayMessage', true)).toMatchObject({
      messageType: 'unsupported',
      unsupportedKind: 'contact',
    });
  });

  it('tipo desconhecido que traz conteúdo vira unsupported/other (não text vazio)', () => {
    expect(classifyMessageType('buttonsResponseMessage', true)).toMatchObject({
      messageType: 'unsupported',
      unsupportedKind: 'other',
    });
  });

  it('mensagem de texto comum não muda', () => {
    expect(classifyMessageType('conversation', true)).toEqual({ messageType: 'text', isControl: false });
    expect(classifyMessageType('extendedTextMessage', true)).toEqual({ messageType: 'text', isControl: false });
    expect(classifyMessageType('text', true)).toEqual({ messageType: 'text', isControl: false });
    expect(classifyMessageType('imageMessage', true)).toEqual({ messageType: 'image', isControl: false });
    expect(classifyMessageType('audioMessage', true)).toEqual({ messageType: 'audio', isControl: false });
  });

  it('tipo de protocolo/controle não vira balão', () => {
    expect(classifyMessageType('protocolMessage', false)).toEqual({
      messageType: 'protocolMessage',
      isControl: true,
    });
    expect(classifyMessageType('senderKeyDistributionMessage', false)).toEqual({
      messageType: 'senderKeyDistributionMessage',
      isControl: true,
    });
  });

  it('desconhecido sem conteúdo mantém o nome cru (não inventa balão vazio)', () => {
    expect(classifyMessageType('algumEventoInterno', false)).toEqual({
      messageType: 'algumEventoInterno',
      isControl: false,
    });
  });
});

describe('normalizeMessage (caminho real public.messages → UI)', () => {
  it('enquete chega como unsupported/poll e preserva o content', () => {
    const out = normalizeMessage(realtimeMessage('poll', 'Reunião?'));
    expect(out.message_type).toBe('unsupported');
    expect(out.unsupportedKind).toBe('poll');
    expect(out.content).toBe('Reunião?');
  });

  it('contato chega como unsupported/contact', () => {
    const out = normalizeMessage(realtimeMessage('contact', '[Contato]'));
    expect(out.message_type).toBe('unsupported');
    expect(out.unsupportedKind).toBe('contact');
  });

  it('visualização única chega como unsupported/view_once', () => {
    const out = normalizeMessage(realtimeMessage('view_once', '', 'https://cdn/x.jpg'));
    expect(out.message_type).toBe('unsupported');
    expect(out.unsupportedKind).toBe('view_once');
  });

  it('mensagem de texto comum não muda', () => {
    const out = normalizeMessage(realtimeMessage('text', 'oi'));
    expect(out.message_type).toBe('text');
    expect(out.unsupportedKind).toBeUndefined();
    expect(out.status).toBe('sent');
  });

  it('tipo de controle não vira balão', () => {
    const out = normalizeMessage(realtimeMessage('protocolMessage', ''));
    expect(out.message_type).toBe('protocolMessage');
    expect(out.unsupportedKind).toBeUndefined();
  });
});
