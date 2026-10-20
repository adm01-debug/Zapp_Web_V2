// ─────────────────────────────────────────────────────────────────────────────
// F39 (Bloco D) — kernel de ELEGIBILIDADE do Multiplix.
//
// Prova, para CADA uma das 7 classes do enum `multiplix_eligibility`:
//   (a) um caso que a PRODUZ (positivo), e
//   (b) um caso que NÃO a produz (falso positivo) — a entrada que um
//       implementador apressado classificaria errado.
// Prova também a ORDEM DE PRECEDÊNCIA documentada no cabeçalho de
// ../eligibility.ts (o bloqueio mais durável/legal domina o transitório) e que
// nenhuma classe inventada escapa do enum canônico.
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/messaging/__tests__/eligibility.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { eligibility } from "../eligibility.ts";
import type { EligibilityContext, EligibilityRecipient } from "../eligibility.ts";
import { MULTIPLIX_ELIGIBILITY_VALUES } from "../../multiplix-eligibility.ts";

const DEST = "5511999998888";

// ─── eligible ────────────────────────────────────────────────────────────────
Deno.test("F39 eligible (positivo): destinatário limpo + contexto permissivo", () => {
  assertEquals(
    eligibility({ destination: DEST }, {}),
    { class: "eligible", reason: "eligible" },
  );
});

Deno.test("F39 eligible (falso positivo): QUALQUER bloqueio impede 'eligible'", () => {
  // Cada bloqueio, sozinho, já tira o destinatário de 'eligible'. Um impl que
  // só olhasse a ausência de destino deixaria todos estes passarem.
  const blocked: Array<[string, EligibilityRecipient, EligibilityContext]> = [
    ["sem destino", {}, {}],
    ["destino inválido", { destination: DEST }, { destinationValid: false }],
    ["blacklist", { destination: DEST }, { blacklist: [DEST] }],
    ["fora do escopo", { destination: DEST }, { inScope: false }],
    ["conexão fora", { destination: DEST }, { connectionAvailable: false }],
    ["mídia pendente", { destination: DEST }, { mediaReady: false }],
    ["exige template", { destination: DEST }, { requiresTemplate: true }],
  ];
  for (const [label, recipient, ctx] of blocked) {
    const result = eligibility(recipient, ctx);
    assert(result.class !== "eligible", `${label}: não deveria ser 'eligible' (${result.class})`);
  }
});

// ─── no_destination ──────────────────────────────────────────────────────────
Deno.test("F39 no_destination (positivo): destino ausente, vazio ou inválido", () => {
  assertEquals(eligibility({}, {}), { class: "no_destination", reason: "missing_destination" });
  assertEquals(eligibility({ destination: null }, {}), { class: "no_destination", reason: "missing_destination" });
  assertEquals(eligibility({ destination: "   " }, {}), { class: "no_destination", reason: "missing_destination" });
  // Destino presente mas marcado como inválido pelo resolvedor E.164 (F38).
  assertEquals(
    eligibility({ destination: "5511" }, { destinationValid: false }),
    { class: "no_destination", reason: "invalid_destination" },
  );
});

Deno.test("F39 no_destination (falso positivo): destino presente e válido NÃO é no_destination", () => {
  const result = eligibility({ destination: DEST }, { destinationValid: true });
  assert(result.class !== "no_destination", `destino válido virou no_destination (reason=${result.reason})`);
  assertEquals(result.class, "eligible");
  // E um destino ausente nunca é mascarado por outro bloqueio mais "chamativo":
  // sem destino não há como casar blacklist/escopo, então no_destination vence.
  assertEquals(eligibility({}, { blacklist: [DEST], inScope: false }).class, "no_destination");
});

// ─── suppressed ──────────────────────────────────────────────────────────────
Deno.test("F39 suppressed (positivo): destino no talkx_blacklist, reason='talkx_blacklist'", () => {
  assertEquals(
    eligibility({ destination: DEST }, { blacklist: [DEST] }),
    { class: "suppressed", reason: "talkx_blacklist" },
  );
  // O casamento é por telefone (dígitos): formatação diferente do MESMO número.
  assertEquals(
    eligibility({ destination: "+55 (11) 99999-8888" }, { blacklist: ["5511999998888"] }),
    { class: "suppressed", reason: "talkx_blacklist" },
  );
});

Deno.test("F39 suppressed (falso positivo): número fora da blacklist NÃO é suprimido", () => {
  const result = eligibility({ destination: DEST }, { blacklist: ["5511888887777"] });
  assert(result.class !== "suppressed", `número fora da blacklist virou suppressed`);
  assertEquals(result.class, "eligible");
  // Lista vazia/ausente não suprime ninguém.
  assertEquals(eligibility({ destination: DEST }, { blacklist: [] }).class, "eligible");
  assertEquals(eligibility({ destination: DEST }, {}).class, "eligible");
});

// ─── out_of_scope ────────────────────────────────────────────────────────────
Deno.test("F39 out_of_scope (positivo): contato fora do escopo do público", () => {
  assertEquals(
    eligibility({ destination: DEST }, { inScope: false }),
    { class: "out_of_scope", reason: "out_of_scope" },
  );
});

Deno.test("F39 out_of_scope (falso positivo): inScope=true ou ausente NÃO bloqueia", () => {
  assert(eligibility({ destination: DEST }, { inScope: true }).class !== "out_of_scope");
  assert(eligibility({ destination: DEST }, {}).class !== "out_of_scope");
  // escopo é política estável: domina o bloqueio transitório de conexão.
  assertEquals(eligibility({ destination: DEST }, { inScope: false, connectionAvailable: false }).class, "out_of_scope");
});

// ─── connection_unavailable ──────────────────────────────────────────────────
Deno.test("F39 connection_unavailable (positivo): conexão do WhatsApp indisponível", () => {
  assertEquals(
    eligibility({ destination: DEST }, { connectionAvailable: false }),
    { class: "connection_unavailable", reason: "connection_unavailable" },
  );
});

Deno.test("F39 connection_unavailable (falso positivo): conexão disponível/ausente NÃO bloqueia", () => {
  assert(eligibility({ destination: DEST }, { connectionAvailable: true }).class !== "connection_unavailable");
  assert(eligibility({ destination: DEST }, {}).class !== "connection_unavailable");
  // transporte do envio inteiro domina a prontidão de um item (mídia).
  assertEquals(
    eligibility({ destination: DEST }, { connectionAvailable: false, mediaReady: false }).class,
    "connection_unavailable",
  );
});

// ─── media_pending ───────────────────────────────────────────────────────────
Deno.test("F39 media_pending (positivo): mídia do item ainda não está pronta", () => {
  assertEquals(
    eligibility({ destination: DEST }, { mediaReady: false }),
    { class: "media_pending", reason: "media_pending" },
  );
});

Deno.test("F39 media_pending (falso positivo): mídia pronta/ausente NÃO bloqueia", () => {
  assert(eligibility({ destination: DEST }, { mediaReady: true }).class !== "media_pending");
  assert(eligibility({ destination: DEST }, {}).class !== "media_pending");
  // mídia pendente vence o template RESERVADO (que fica inerte por padrão).
  assertEquals(
    eligibility({ destination: DEST }, { mediaReady: false, requiresTemplate: true }).class,
    "media_pending",
  );
});

// ─── requires_template (RESERVADO) ───────────────────────────────────────────
Deno.test("F39 requires_template (positivo): só quando explicitamente exigido", () => {
  assertEquals(
    eligibility({ destination: DEST }, { requiresTemplate: true }),
    { class: "requires_template", reason: "requires_template" },
  );
});

Deno.test("F39 requires_template (falso positivo): RESERVADO fica inerte sem sinal explícito", () => {
  assert(eligibility({ destination: DEST }, { requiresTemplate: false }).class !== "requires_template");
  assert(eligibility({ destination: DEST }, {}).class !== "requires_template");
  // Um destinatário sem destino não "vira" requires_template.
  assertEquals(eligibility({}, { requiresTemplate: true }).class, "no_destination");
});

// ─── Precedência (a ordem documentada no cabeçalho) ──────────────────────────
Deno.test("F39 precedência: opt-out domina conexão, mídia e escopo", () => {
  assertEquals(
    eligibility(
      { destination: DEST },
      { blacklist: [DEST], inScope: false, connectionAvailable: false, mediaReady: false, requiresTemplate: true },
    ),
    { class: "suppressed", reason: "talkx_blacklist" },
  );
});

// ─── Fechamento contra o enum canônico ───────────────────────────────────────
Deno.test("F39: toda classe devolvida pertence ao enum multiplix_eligibility", () => {
  const contexts: EligibilityContext[] = [
    {},
    { destinationValid: false },
    { blacklist: [DEST] },
    { inScope: false },
    { connectionAvailable: false },
    { mediaReady: false },
    { requiresTemplate: true },
  ];
  for (const ctx of contexts) {
    const decision = eligibility({ destination: DEST }, ctx);
    assert(
      MULTIPLIX_ELIGIBILITY_VALUES.includes(decision.class),
      `classe fora do enum canônico: ${decision.class}`,
    );
  }
  // As 7 classes são ALCANÇÁVEIS por este kernel (nenhuma órfã).
  const reachable = new Set<string>([
    eligibility({ destination: DEST }, {}).class,
    eligibility({}, {}).class,
    eligibility({ destination: DEST }, { blacklist: [DEST] }).class,
    eligibility({ destination: DEST }, { inScope: false }).class,
    eligibility({ destination: DEST }, { connectionAvailable: false }).class,
    eligibility({ destination: DEST }, { mediaReady: false }).class,
    eligibility({ destination: DEST }, { requiresTemplate: true }).class,
  ]);
  for (const value of MULTIPLIX_ELIGIBILITY_VALUES) {
    assert(reachable.has(value), `kernel não produz a classe '${value}'`);
  }
});
