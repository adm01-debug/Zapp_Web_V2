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

Deno.test('message delivery builds an Evolution buttons body only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '🔘 *Botões:* Escolha',
    message_type: 'buttons', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, {
    title: 'Menu',
    body: 'Escolha uma opção',
    buttons: [
      { type: 'reply', displayText: 'Atendimento', id: 'btn_1' },
      { type: 'url', displayText: 'Ver oferta', url: 'https://loja.example/oferta' },
    ],
  });
  if (result.path !== '/message/sendButtons/main') throw new Error('wrong buttons route');
  if (result.body.number !== '5511999999999') throw new Error('wrong recipient');
  if (result.body.title !== 'Menu') throw new Error('title not forwarded');
  if (result.body.description !== 'Escolha uma opção') throw new Error('body must map to description');
  if (result.body.footer !== ' ') throw new Error('missing footer must become a single space (GO rejects empty)');
  const buttons = result.body.buttons as Record<string, unknown>[];
  if (buttons.length !== 2) throw new Error('buttons not forwarded');
  if (buttons[0].type !== 'reply' || buttons[0].displayText !== 'Atendimento' || buttons[0].id !== 'btn_1') {
    throw new Error('reply button fields not preserved');
  }
  if (buttons[1].type !== 'url' || buttons[1].url !== 'https://loja.example/oferta') {
    throw new Error('CTA URL button fields not preserved');
  }
});

Deno.test('message delivery builds an Evolution list body only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📋 *Lista:* Escolha',
    message_type: 'list', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, {
    body: 'Selecione uma categoria',
    footer: 'Promo Brindes',
    buttonText: 'Ver opções',
    sections: [
      { title: 'Produtos', rows: [{ id: 'row_1', title: 'Smartphones', description: 'Linha completa' }] },
    ],
  });
  if (result.path !== '/message/sendList/main') throw new Error('wrong list route');
  if (result.body.description !== 'Selecione uma categoria') throw new Error('body must map to description');
  if (result.body.footer !== 'Promo Brindes') throw new Error('footer not forwarded');
  if (result.body.buttonText !== 'Ver opções') throw new Error('buttonText not forwarded');
  const sections = result.body.sections as { rows: Record<string, unknown>[] }[];
  if (sections.length !== 1 || sections[0].rows.length !== 1) throw new Error('sections not forwarded');
  const row = sections[0].rows[0];
  if (row.title !== 'Smartphones' || row.description !== 'Linha completa' || row.rowId !== 'row_1') {
    throw new Error('list row must keep title/description and map id to rowId');
  }
});

Deno.test('message delivery rejects malformed persisted interactive payloads', () => {
  const claim = {
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: 'x',
    media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  };
  const cases: { type: 'buttons' | 'list'; payload: Record<string, unknown>; expected: string }[] = [
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: '', buttons: [{ type: 'reply', displayText: 'Ok' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [
      { type: 'reply', displayText: '1' }, { type: 'reply', displayText: '2' },
      { type: 'reply', displayText: '3' }, { type: 'reply', displayText: '4' },
    ] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'url', displayText: 'Abrir', url: 'javascript:alert(1)' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'reply' }] } },
    { type: 'list', expected: 'invalid_list_payload', payload: { body: 'b', buttonText: 'Ver', sections: [] } },
    { type: 'list', expected: 'invalid_list_payload', payload: { body: 'b', buttonText: 'Ver', sections: [{ title: 'S', rows: [{ title: 'T' }] }] } },
  ];
  for (const { type, payload, expected } of cases) {
    let rejected = '';
    try {
      providerPayload({ ...claim, message_type: type }, null, payload);
    } catch (error) {
      rejected = error instanceof Error ? error.message : 'unknown';
    }
    if (rejected !== expected) {
      throw new Error(`payload ${JSON.stringify(payload)} should fail with ${expected}, got ${rejected || 'accepted'}`);
    }
  }
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
