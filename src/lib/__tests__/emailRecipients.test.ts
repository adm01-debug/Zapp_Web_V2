import { describe, expect, it } from 'vitest';
import { invalidEmailTokens, parseEmailAddressList, prefixEmailSubject, resolveReplyRecipients } from '../emailRecipients';
import type { EmailMessage } from '@/hooks/gmail/gmailTypes';

const message = (overrides: Partial<EmailMessage> = {}): EmailMessage => ({
  id: 'local-1', thread_id: 'thread-local', gmail_message_id: 'gmail-1', gmail_account_id: 'account-1',
  from_address: 'sender@example.com', from_name: 'Sender', to_addresses: ['me@example.com', 'other@example.com'],
  cc_addresses: ['copy@example.com', 'ME@example.com'], bcc_addresses: [], reply_to_address: 'reply@example.com',
  subject: 'Assunto', body_text: '', body_html: '', snippet: '', label_ids: [], is_read: false,
  is_starred: false, has_attachments: false, in_reply_to: null, references_header: null,
  internal_date: '2026-10-02T12:00:00Z', direction: 'inbound', created_at: '2026-10-02T12:00:00Z',
  ...overrides,
});

describe('emailRecipients', () => {
  it('preserva vírgula em nome citado e deduplica sem diferenciar caixa', () => {
    expect(parseEmailAddressList('"Silva, Ana" <ana@example.com>; ANA@example.com, b@example.com')).toEqual([
      'ana@example.com', 'b@example.com',
    ]);
  });

  it('rejeita injeção CRLF e tokens inválidos', () => {
    expect(parseEmailAddressList('ok@example.com\r\nBcc: victim@example.com')).toEqual([]);
    expect(invalidEmailTokens('ok@example.com, não-é-email')).toEqual(['não-é-email']);
  });

  it('usa Reply-To, exclui a própria conta e mantém Cc separado no reply-all', () => {
    expect(resolveReplyRecipients(message(), 'reply-all', 'me@example.com')).toEqual({
      to: ['reply@example.com', 'other@example.com'],
      cc: ['copy@example.com'],
    });
  });

  it('não duplica prefixos de assunto', () => {
    expect(prefixEmailSubject('Re: Olá', 'Re')).toBe('Re: Olá');
    expect(prefixEmailSubject('Oferta', 'Fwd')).toBe('Fwd: Oferta');
  });
});
