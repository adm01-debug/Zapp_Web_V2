import { describe, expect, it } from 'vitest';
import { mapMessageRowToMessage } from '../inboxAdapter';

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
