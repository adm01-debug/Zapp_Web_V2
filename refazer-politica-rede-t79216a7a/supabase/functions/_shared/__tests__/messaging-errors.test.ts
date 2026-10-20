// F42 — classificação de erro do provedor, backoff com teto e mapa código→texto
// para operador (E095). Casos vermelhos do plano: opt-out e número inexistente
// NUNCA reententam (permanent) mesmo com status que pareceria transitório;
// 429/5xx reententam e param no teto (30 s/2 min/10 min) indo a dead letter na 4ª.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BACKOFF_CEILING_MS,
  MAX_ATTEMPTS,
  OPERATOR_ERROR_MESSAGES,
  classifyProviderError,
  nextBackoff,
  operatorMessageFor,
  operatorMessageForError,
  planRetry,
  providerErrorInfo,
} from "../messaging/errors.ts";

// Relógio determinístico: nenhuma asserção depende de Date.now().
const T0 = 1_800_000_000_000;

// ── (c) opt-out e número inexistente => permanent, nunca reententam ─────────

Deno.test("F42 opt-out é permanent e nunca reententa (dead letter já na 1ª)", () => {
  for (const body of [
    { message: "recipient blocked you" },
    { error: "User has opted out" },
    "Contato pediu descadastro (opt-out)",
    { message: "blocklist" },
  ]) {
    const info = providerErrorInfo(400, body);
    assertEquals(info.class, "permanent", `esperava permanent para ${JSON.stringify(body)}`);
    assertEquals(info.code, "opt_out");
    const d = planRetry(info, 1, T0);
    assertEquals(d.action, "dead_letter");
    assertEquals(d.delayMs, 0);
    assertEquals(d.retryAfter, undefined);
  }
  // classifyProviderError devolve exatamente a classe pedida
  assertEquals(classifyProviderError(400, { message: "recipient blocked you" }), "permanent");
});

Deno.test("F42 número inexistente é permanent (mensagem e shape do /user/check)", () => {
  const porMensagem = providerErrorInfo(400, { message: "Number is not registered on WhatsApp" });
  assertEquals(porMensagem.class, "permanent");
  assertEquals(porMensagem.code, "number_not_exists");
  assertEquals(planRetry(porMensagem, 1, T0).action, "dead_letter");

  // shape normalizado do proxy: {exists:false}
  assertEquals(classifyProviderError(200, { exists: false }), "permanent");
  // shape cru do GO: Users[].IsInWhatsapp = false
  const cru = providerErrorInfo(200, { data: { Users: [{ IsInWhatsapp: false, JID: "x@s.whatsapp.net" }] } });
  assertEquals(cru.class, "permanent");
  assertEquals(cru.code, "number_not_exists");
});

Deno.test("F42 sinal permanente vence o status: 5xx com opt-out/número não reententa", () => {
  const optOut = providerErrorInfo(500, { message: "recipient blocked you" });
  assertEquals(optOut.class, "permanent");
  assertEquals(planRetry(optOut, 1, T0).action, "dead_letter");

  const inexistente = providerErrorInfo(500, { message: "number is not registered" });
  assertEquals(inexistente.class, "permanent");
  assertEquals(classifyProviderError(500, { message: "no such user" }), "permanent");
});

// ── 429 / 5xx => transient com teto determinístico ──────────────────────────

Deno.test("F42 429 é transient e reententa parando no teto 30s/2min/10min", () => {
  const info = providerErrorInfo(429, { message: "Too Many Requests" });
  assertEquals(info.class, "transient");
  assertEquals(info.code, "rate_limited");

  const d1 = planRetry(info, 1, T0);
  const d2 = planRetry(info, 2, T0);
  const d3 = planRetry(info, 3, T0);
  const d4 = planRetry(info, 4, T0);

  assertEquals([d1.action, d2.action, d3.action], ["retry", "retry", "retry"]);
  assertEquals([d1.delayMs, d2.delayMs, d3.delayMs], [30_000, 120_000, 600_000]);
  assertEquals(d1.retryAfter, new Date(T0 + 30_000).toISOString());
  assertEquals(d2.retryAfter, new Date(T0 + 120_000).toISOString());
  assertEquals(d3.retryAfter, new Date(T0 + 600_000).toISOString());
  // teto: nunca passa de 10 min
  for (const d of [d1, d2, d3]) assert(d.delayMs <= 600_000, "backoff passou do teto");
  // 4ª tentativa -> dead letter
  assertEquals(d4.action, "dead_letter");
  assertEquals(d4.delayMs, 0);
  assertEquals(d4.retryAfter, undefined);
  // depois da 4ª continua dead letter (não reinicia o ciclo)
  assertEquals(nextBackoff(5, T0).action, "dead_letter");
  assertEquals(planRetry(info, 99, T0).action, "dead_letter");
});

Deno.test("F42 5xx é transient; 500/502/503/504 reententam e param no teto", () => {
  for (const status of [500, 502, 503, 504]) {
    const info = providerErrorInfo(status, { message: "Internal Server Error" });
    assertEquals(info.class, "transient", `status ${status}`);
    assertEquals(info.code, "provider_unavailable");
  }
  assertEquals(planRetry(providerErrorInfo(503, {}), 3, T0).delayMs, 600_000);
  assertEquals(planRetry(providerErrorInfo(503, {}), 4, T0).action, "dead_letter");
  assertEquals(classifyProviderError(500, undefined), "transient");
});

Deno.test("F42 teto é monotônico e nunca ultrapassa BACKOFF_CEILING_MS", () => {
  assertEquals([...BACKOFF_CEILING_MS], [30_000, 120_000, 600_000]);
  assertEquals(MAX_ATTEMPTS, 4);
  let anterior = 0;
  for (const attempt of [1, 2, 3]) {
    const d = nextBackoff(attempt, T0);
    assertEquals(d.action, "retry");
    assert(d.delayMs >= anterior, "backoff deve ser não-decrescente");
    assert(d.delayMs <= Math.max(...BACKOFF_CEILING_MS), "backoff acima do teto");
    anterior = d.delayMs;
  }
});

// ── corpo ilegível / status desconhecido => unknown ─────────────────────────

Deno.test("F42 corpo ilegível ou status desconhecido => unknown", () => {
  assertEquals(classifyProviderError(0, null), "unknown");
  assertEquals(classifyProviderError(0, undefined), "unknown");
  assertEquals(classifyProviderError(0, "i'm a teapot"), "unknown");
  assertEquals(classifyProviderError(200, { message: "tudo certo" }), "unknown");

  const circular: Record<string, unknown> = {};
  circular.self = circular; // JSON.stringify lança -> corpo ilegível
  assertEquals(classifyProviderError(0, circular), "unknown");
  assertEquals(classifyProviderError(0, 10n), "unknown");

  const info = providerErrorInfo(0, null);
  assertEquals(info.class, "unknown");
  assertEquals(info.code, "unknown");
  assert(info.operatorMessage.length > 0);
});

// ── mapa código→texto para operador (E095) ──────────────────────────────────

Deno.test("F42 mapa código→texto (E095) nunca expõe JSON cru", () => {
  assertEquals(operatorMessageFor("number_not_exists"), "Número não existe no WhatsApp.");
  assertEquals(operatorMessageFor("opt_out"), OPERATOR_ERROR_MESSAGES.opt_out);
  // código desconhecido cai no texto genérico, nunca no código cru
  assertEquals(operatorMessageFor("CODIGO_NAO_MAPEADO"), OPERATOR_ERROR_MESSAGES.unknown);
  assertEquals(operatorMessageForError(429, {}), OPERATOR_ERROR_MESSAGES.rate_limited);
  assertEquals(operatorMessageForError(400, { message: "number is not registered" }), OPERATOR_ERROR_MESSAGES.number_not_exists);
  for (const [code, texto] of Object.entries(OPERATOR_ERROR_MESSAGES)) {
    assert(texto.length > 0, `${code} sem texto`);
    assert(!texto.includes("{"), `${code} não pode expor JSON cru`);
  }
});
