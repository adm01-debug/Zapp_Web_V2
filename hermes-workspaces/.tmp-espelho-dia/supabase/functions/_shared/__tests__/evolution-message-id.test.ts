/**
 * Extrator do id da mensagem da Evolution (`extractMessageId`) cobrindo TODAS as
 * formas de resposta conhecidas — porte da `src/lib/evolutionMessageId.ts` da V3
 * mais o envelope da Evolution GO (`data.Info.ID`, que a V2 já entendia).
 *
 * Por que importa: sem o id, `message-delivery` não correlaciona o reenvio ao
 * MESMO `external_id` e devolve 502/reconciliação mesmo com o WhatsApp já tendo
 * entregue; o mesmo extrator serve talkx-send, multiplix-send, effect-reconcile
 * e evolution-go. As formas abaixo são as que aparecem nos endpoints
 * sendText/sendMedia/sendWhatsAppAudio/sendSticker e nos envelopes de proxy.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-read \
 *           supabase/functions/_shared/__tests__/evolution-message-id.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { extractMessageId } from '../evolution-send.ts';

Deno.test('extractMessageId: v2 sendText/key.id e key string', () => {
  assertEquals(extractMessageId({ key: { id: 'wamid.1' } }), 'wamid.1');
  assertEquals(extractMessageId({ key: 'wamid.2' }), 'wamid.2');
});

Deno.test('extractMessageId: messageId / keyId / id de builds antigas', () => {
  assertEquals(extractMessageId({ messageId: 'wamid.3' }), 'wamid.3');
  assertEquals(extractMessageId({ keyId: 'wamid.4' }), 'wamid.4');
  assertEquals(extractMessageId({ id: 'wamid.5' }), 'wamid.5');
});

Deno.test('extractMessageId: mídia em envelope message/response/data/result', () => {
  assertEquals(extractMessageId({ message: { key: { id: 'wamid.6' } } }), 'wamid.6');
  assertEquals(extractMessageId({ response: { key: { id: 'wamid.7' } } }), 'wamid.7');
  assertEquals(extractMessageId({ data: { key: { id: 'wamid.8' } } }), 'wamid.8');
  assertEquals(extractMessageId({ result: { key: { id: 'wamid.9' } } }), 'wamid.9');
});

Deno.test('extractMessageId: áudio aninhado em dois níveis (retry do sendWhatsAppAudio)', () => {
  assertEquals(extractMessageId({ message: { message: { key: { id: 'wamid.10' } } } }), 'wamid.10');
});

Deno.test('extractMessageId: figurinha e key Baileys padrão (remoteJid + id)', () => {
  assertEquals(extractMessageId({ id: 'wamid.sticker' }), 'wamid.sticker');
  assertEquals(
    extractMessageId({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: 'wamid.baileys' } }),
    'wamid.baileys',
  );
});

Deno.test('extractMessageId: envelope da Evolution GO (data.Info.ID)', () => {
  assertEquals(extractMessageId({ message: 'success', data: { Info: { ID: 'wamid.go' } } }), 'wamid.go');
  assertEquals(extractMessageId({ data: { Info: { ID: 'wamid.go2' } } }), 'wamid.go2');
});

Deno.test('extractMessageId: primeiro id não vazio com trim', () => {
  assertEquals(extractMessageId({ key: { id: '  wamid.trim  ' } }), 'wamid.trim');
  // key vazio/em branco não pode vencer o campo seguinte.
  assertEquals(extractMessageId({ key: { id: '   ' }, messageId: 'wamid.depois' }), 'wamid.depois');
});

Deno.test('extractMessageId: null-safe e sem falso positivo', () => {
  for (const entrada of [null, undefined, 0, 1, '', 'wamid.primitivo', true, [], {}, { key: null },
    { key: {} }, { data: null }, { data: {} }, { data: { Info: null } }, { data: { Info: {} } },
    { message: null }, { message: [] }, { key: { id: '' } }]) {
    assertEquals(extractMessageId(entrada), undefined, `entrada ${JSON.stringify(entrada)} deveria ser undefined`);
  }
});
