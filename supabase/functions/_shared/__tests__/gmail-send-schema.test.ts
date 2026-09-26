import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { GmailSendActionSchema } from "../schemas.ts";

// thread_id/message_id/message_ids sao interpolados direto na URL da API do
// Gmail (/messages/{id}/modify, /threads/{id}/trash, etc.) em varios cases de
// gmail-send/index.ts. Achado da auditoria de 2026-09-26: sem regex de charset,
// um valor como "../" ou "x?evil=1" passaria intacto pro fetch(). Este teste
// cobre o limite exato do fix.

function baseBody(overrides: Record<string, unknown>) {
  return { action: 'trash-thread', account_id: '11111111-1111-1111-1111-111111111111', ...overrides };
}

Deno.test('GmailSendActionSchema aceita um thread_id real do Gmail (hex curto)', () => {
  const result = GmailSendActionSchema.safeParse(baseBody({ thread_id: '18abf3c2e9d4f1a2' }));
  assertEquals(result.success, true);
});

Deno.test('GmailSendActionSchema rejeita thread_id com barra (path injection)', () => {
  const result = GmailSendActionSchema.safeParse(baseBody({ thread_id: '../drafts' }));
  assertEquals(result.success, false);
});

Deno.test('GmailSendActionSchema rejeita thread_id com query string embutida', () => {
  const result = GmailSendActionSchema.safeParse(baseBody({ thread_id: 'abc123?foo=bar' }));
  assertEquals(result.success, false);
});

Deno.test('GmailSendActionSchema rejeita message_id com espaço ou #', () => {
  assertEquals(GmailSendActionSchema.safeParse(baseBody({ action: 'trash', message_id: 'abc 123' })).success, false);
  assertEquals(GmailSendActionSchema.safeParse(baseBody({ action: 'trash', message_id: 'abc#123' })).success, false);
});

Deno.test('GmailSendActionSchema rejeita se qualquer elemento de message_ids for inválido', () => {
  const result = GmailSendActionSchema.safeParse(baseBody({
    action: 'mark-read',
    message_ids: ['abc123', '../etc/passwd'],
  }));
  assertEquals(result.success, false);
});

Deno.test('GmailSendActionSchema aceita message_ids todos válidos', () => {
  const result = GmailSendActionSchema.safeParse(baseBody({
    action: 'mark-read',
    message_ids: ['abc123', 'def_456-XYZ'],
  }));
  assertEquals(result.success, true);
});
