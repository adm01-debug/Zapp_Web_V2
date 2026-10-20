import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { normalizeWebhookEvents, type WebhookRecord } from "./index.ts";

// Cobre a normalizacao real de `webhook.events` usada pelo diagnostico da
// Evolution v2 legada (FIX desta sessao — o tipo `string | string[]` era
// atribuido direto a `string[]` sem normalizar, e a interface `WebhookRecord`
// nao declarava `webhookByEvents`/`webhookBase64`, lidos no mesmo objeto).

Deno.test("normalizeWebhookEvents - events já é array, passa direto", () => {
  const webhook: WebhookRecord = { events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] };
  assertEquals(normalizeWebhookEvents(webhook), ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]);
});

Deno.test("normalizeWebhookEvents - events é string única, empacota em array", () => {
  const webhook: WebhookRecord = { events: "MESSAGES_UPSERT" };
  assertEquals(normalizeWebhookEvents(webhook), ["MESSAGES_UPSERT"]);
});

Deno.test("normalizeWebhookEvents - events ausente, retorna array vazio", () => {
  const webhook: WebhookRecord = {};
  assertEquals(normalizeWebhookEvents(webhook), []);
});

Deno.test("normalizeWebhookEvents - webhook null, retorna array vazio", () => {
  assertEquals(normalizeWebhookEvents(null), []);
});

Deno.test("normalizeWebhookEvents - array vazio explícito, preserva vazio", () => {
  const webhook: WebhookRecord = { events: [] };
  assertEquals(normalizeWebhookEvents(webhook), []);
});

Deno.test("WebhookRecord aceita webhookByEvents/webhookBase64 sem erro de tipo", () => {
  const webhook: WebhookRecord = {
    events: ["ALL"],
    webhookByEvents: false,
    webhookBase64: true,
  };
  assertEquals(webhook.webhookByEvents, false);
  assertEquals(webhook.webhookBase64, true);
});
