import { describe, expect, it } from 'vitest';

import { evolutionToRealtimeMessage } from '@/adapters/evolutionAdapter';
import type { EvolutionMessage } from '@/types/evolutionExternal';

const externalMessage: EvolutionMessage = {
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
};

describe('evolutionToRealtimeMessage', () => {
  it('initializes local delivery metadata without inventing a delivery claim', () => {
    const message = evolutionToRealtimeMessage(externalMessage);

    expect(message).toMatchObject({
      id: 'external-row-id',
      contact_id: '5511999999999@s.whatsapp.net',
      client_message_id: null,
      delivery_attempt_count: 0,
      delivery_claim_expires_at: null,
      delivery_claim_token: null,
      delivery_claimed_at: null,
      delivery_claimed_by: null,
      delivery_last_claim_token: null,
    });
  });
});
