/**
 * normalizePhone + status monotônico + rate limit por IP — testando o CÓDIGO REAL.
 *
 * Substitui os 4 espelhos de `src/lib/__tests__/` (phoneNormalization,
 * webhookStatusPriority, rateLimiter, groupsAutoSync) que copiavam a lógica em
 * vez de importá-la: um espelho nunca falha quando a regra real muda, então ele
 * não prova nada. Aqui importamos `normalizePhone`/`shouldUpdateStatus` de
 * `_shared/evolution-helpers.ts` e `checkRateLimit` de `_shared/validation.ts`,
 * que são os mesmos usados pelo webhook (`evolution-webhook/index.ts`).
 *
 * Sem dado real: todos os números são sintéticos (prefixo 5511 com dígitos
 * repetidos). Nenhum contato, telefone ou mensagem de cliente entra aqui.
 *
 * Rodar:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *     --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-helpers-phone-status.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { normalizePhone, shouldUpdateStatus } from "../evolution-helpers.ts";
import { checkRateLimit } from "../validation.ts";

// ─── normalizePhone: LIDs e o que NÃO é telefone ────────────────────────────
// O webhook usa normalizePhone para decidir se cria/atualiza contato. Um LID
// (identificador de dispositivo) aceito aqui fragmenta o contato em vários
// (E35), por isso os casos de rejeição são o núcleo deste arquivo.

Deno.test("normalizePhone rejeita JID @lid (identificador, não telefone)", () => {
  assertEquals(normalizePhone("123456789012345@lid"), null);
  // mesmos dígitos nus, sem o sufixo: a heurística de tamanho também rejeita
  assertEquals(normalizePhone("123456789012345"), null);
});

Deno.test("normalizePhone rejeita 14+ dígitos nus como possível LID", () => {
  assertEquals(normalizePhone("12345678901234"), null); // 14 dígitos
  assertEquals(normalizePhone("123456789012345"), null); // 15 dígitos
});

Deno.test("normalizePhone aceita prefixos de grupo WhatsApp mesmo com 14+ dígitos", () => {
  // isGroupJid usa o sufixo; a heurística de LID abre exceção por prefixo
  // (120363/120392/120415/120496) — cada prefixo tem de passar.
  assertEquals(normalizePhone("120363999999999999@g.us"), "120363999999999999");
  assertEquals(normalizePhone("120392999999999999"), "120392999999999999");
  assertEquals(normalizePhone("120415999999999999"), "120415999999999999");
  assertEquals(normalizePhone("120496999999999999"), "120496999999999999");
});

Deno.test("normalizePhone remove sufixo :NN@ (device id), +, @broadcast e @s.whatsapp.net", () => {
  assertEquals(normalizePhone("5511999999999@s.whatsapp.net"), "5511999999999");
  assertEquals(normalizePhone("+5511999999999"), "5511999999999");
  assertEquals(normalizePhone("5511999999999:12@s.whatsapp.net"), "5511999999999");
  assertEquals(normalizePhone("+5511999999999@s.whatsapp.net"), "5511999999999");
  // @broadcast não é JID de contato: sobram as letras do rótulo
  assertEquals(normalizePhone("status@broadcast"), "status");
});

Deno.test("normalizePhone só rejeita o que é LID; telefone comum passa", () => {
  assertEquals(normalizePhone("5511999999999"), "5511999999999"); // 13 dígitos
  assertEquals(normalizePhone("120363999999999999@g.us"), "120363999999999999"); // grupo
  assertEquals(normalizePhone(""), null);
  assertEquals(normalizePhone(undefined), null);
});

// ─── shouldUpdateStatus: status monotônico ──────────────────────────────────
// Recibo de status fora de ordem (um `delivered` atrasado chegando depois do
// `read`) não pode regredir a mensagem; `deleted`/`failed` são terminais.

Deno.test("shouldUpdateStatus não regride read → delivered/sent", () => {
  assertEquals(shouldUpdateStatus("read", "delivered"), false);
  assertEquals(shouldUpdateStatus("read", "sent"), false);
  assertEquals(shouldUpdateStatus("delivered", "sent"), false);
});

Deno.test("shouldUpdateStatus exige avanço estrito na prioridade", () => {
  assertEquals(shouldUpdateStatus("sending", "sent"), true);
  assertEquals(shouldUpdateStatus("sent", "delivered"), true);
  assertEquals(shouldUpdateStatus("delivered", "read"), true);
  assertEquals(shouldUpdateStatus("sent", "read"), true);
  assertEquals(shouldUpdateStatus("read", "read"), false); // igual não regrava
  assertEquals(shouldUpdateStatus(null, "sent"), true); // sem status, aplica
});

Deno.test("shouldUpdateStatus: deleted e failed sempre aplicam", () => {
  for (const atual of ["sending", "sent", "delivered", "read"]) {
    assertEquals(shouldUpdateStatus(atual, "deleted"), true);
    assertEquals(shouldUpdateStatus(atual, "failed"), true);
  }
});

// ─── checkRateLimit: 429 por IP no webhook (200/min) ────────────────────────
// evolution-webhook/index.ts:107 chama checkRateLimit(`evowh:${ip}`, 200, 60_000)
// e devolve 429 quando !allowed. O limiter é por isolate, com chave por IP.

Deno.test("checkRateLimit libera 200 eventos do mesmo IP e bloqueia o 201º (429)", () => {
  const key = "evowh:198.51.100.7"; // faixa de documentação (RFC 5737), não é cliente
  for (let i = 0; i < 200; i++) {
    const { allowed } = checkRateLimit(key, 200, 60_000);
    assert(allowed, `evento ${i + 1} deveria ser liberado`);
  }
  const bloqueado = checkRateLimit(key, 200, 60_000);
  assertEquals(bloqueado.allowed, false);
  assertEquals(bloqueado.remaining, 0);
});

Deno.test("checkRateLimit isola por chave: outro IP não herda o bloqueio", () => {
  const keyA = "evowh:198.51.100.8";
  const keyB = "evowh:198.51.100.9";
  for (let i = 0; i < 200; i++) checkRateLimit(keyA, 200, 60_000);
  assertEquals(checkRateLimit(keyA, 200, 60_000).allowed, false);
  assertEquals(checkRateLimit(keyB, 200, 60_000).allowed, true);
});

Deno.test("checkRateLimit respeita o teto passado (não o default de 30)", () => {
  const key = "evowh:198.51.100.10";
  for (let i = 0; i < 30; i++) {
    assert(checkRateLimit(key, 200, 60_000).allowed, `evento ${i + 1}/30`);
  }
  assertEquals(checkRateLimit(key, 200, 60_000).allowed, true); // 31º ainda ok com teto 200
});
