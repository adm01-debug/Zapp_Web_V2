import { handleMessageDeliveryRequest, providerPayload } from './index.ts';

function assertStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`expected HTTP ${expected}, got ${actual}`);
}

Deno.test('message delivery rejects methods other than POST before reading secrets', async () => {
  const response = await handleMessageDeliveryRequest(new Request('https://edge.invalid', { method: 'GET' }));
  assertStatus(response.status, 405);
});

Deno.test('message delivery rejects unauthenticated callers before reading the body', async () => {
  const response = await handleMessageDeliveryRequest(new Request('https://edge.invalid', {
    method: 'POST', body: 'not-json',
  }));
  assertStatus(response.status, 401);
});

Deno.test('message delivery builds an Evolution poll only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📊 *Enquete:* Preferência',
    message_type: 'poll', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, { name: 'Preferência', values: ['A', 'B'], selectableCount: 1 });
  if (result.path !== '/message/sendPoll/main') throw new Error('wrong poll route');
  if (result.body.number !== '5511999999999') throw new Error('wrong recipient');
});

Deno.test('message delivery rejects a malformed persisted contact payload', () => {
  let rejected = false;
  try {
    providerPayload({
      message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📇 Cartão de contato',
      message_type: 'contact', media_url: null, caption: null, media_filename: null, media_mimetype: null,
      reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
    }, null, { fullName: '', phoneNumber: 'not-a-phone' });
  } catch { rejected = true; }
  if (!rejected) throw new Error('malformed contact payload was accepted');
});

Deno.test('media delivery never turns timeline placeholders into captions and preserves quoted replies', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '[Imagem]',
    message_type: 'image', media_url: 'https://storage.invalid/image', caption: null,
    media_filename: null, media_mimetype: null, reply_external_id: 'wa-message-id',
    whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, 'https://signed.invalid/image');
  if ('caption' in result.body) throw new Error('internal media placeholder became a provider caption');
  const quoted = result.body.quoted as { key?: { id?: string } } | undefined;
  if (quoted?.key?.id !== 'wa-message-id') throw new Error('quoted reply metadata was not preserved');
});
