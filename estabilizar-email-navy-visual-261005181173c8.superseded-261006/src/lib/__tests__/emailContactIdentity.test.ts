import { describe, expect, it } from 'vitest';
import type { EmailMessage } from '@/hooks/integrations/useGmail';
import { resolveEmailConversationPerson } from '../emailContactIdentity';

const message = (overrides: Partial<EmailMessage>): EmailMessage => ({
  id: 'm1', thread_id: 't1', gmail_message_id: 'g1', gmail_account_id: 'a1',
  from_address: 'external@example.com', from_name: 'External', to_addresses: ['agent@example.com'],
  cc_addresses: [], bcc_addresses: [], reply_to_address: null, subject: '', body_text: '', body_html: '', snippet: '',
  label_ids: [], is_read: true, is_starred: false, has_attachments: false, in_reply_to: null,
  references_header: null, internal_date: '2026-10-03T12:00:00.000Z', direction: 'inbound', created_at: '2026-10-03T12:00:00.000Z',
  ...overrides,
});

describe('resolveEmailConversationPerson', () => {
  it('keeps the latest inbound external sender when the last message was sent by us', () => {
    const result = resolveEmailConversationPerson([
      message({ id: 'outbound', direction: 'outbound', from_address: 'agent@example.com', from_name: 'Agent', to_addresses: ['external@example.com'], internal_date: '2026-10-03T13:00:00.000Z' }),
      message({ id: 'inbound', internal_date: '2026-10-03T12:00:00.000Z' }),
    ], 'agent@example.com');
    expect(result).toEqual({ email: 'external@example.com', name: 'External' });
  });

  it('uses the primary outbound recipient when a thread has no incoming message', () => {
    const result = resolveEmailConversationPerson([
      message({ direction: 'outbound', from_address: 'agent@example.com', to_addresses: ['primary@example.com'], cc_addresses: ['copied@example.com'] }),
    ], 'agent@example.com');
    expect(result).toEqual({ email: 'primary@example.com', name: null });
  });

  it('keeps the original external participant when another address replies later', () => {
    const result = resolveEmailConversationPerson([
      message({ id: 'first', from_address: 'owner@example.com', from_name: 'Owner', internal_date: '2026-10-03T10:00:00.000Z' }),
      message({ id: 'later', from_address: 'copied@example.com', from_name: 'Copied', internal_date: '2026-10-03T14:00:00.000Z' }),
    ], 'agent@example.com');
    expect(result).toEqual({ email: 'owner@example.com', name: 'Owner' });
  });
});
