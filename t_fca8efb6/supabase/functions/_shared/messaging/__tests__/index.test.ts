// Teste de fumo do kernel de mensageria (Bloco D / F36).
//
// Criterio de aceite do F36: "importavel pelos dois `*-send`". Este teste prova isso do
// jeito mais direto possivel — importando TUDO pela face publica (`index.ts`, nunca pelos
// modulos internos) e conferindo que cada contrato do bloco tem um simbolo vivo:
// personalizacao, E.164, elegibilidade, midia, adaptador de provedor e classificacao de
// erro. Se alguem renomear ou parar de reexportar um modulo, este teste cai.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  BACKOFF_CEILING_MS,
  capabilities,
  classifyProviderError,
  eligibility,
  MAX_ATTEMPTS,
  newCorrelationId,
  normalizePhone,
  personalize,
  prepareMedia,
  presenceForKind,
  send,
} from "../index.ts";

Deno.test("F36: cada contrato do kernel tem um simbolo importavel pela face publica", () => {
  const funcoes: Record<string, unknown> = {
    // personalizacao (F37)
    personalize,
    // E.164 BR (F38)
    normalizePhone,
    // elegibilidade (F39)
    eligibility,
    // midia (F40)
    prepareMedia,
    // adaptador de provedor (F41)
    capabilities,
    presenceForKind,
    send,
    // classificacao de erro (F42)
    classifyProviderError,
    // correlacao (F43)
    newCorrelationId,
  };
  for (const [nome, fn] of Object.entries(funcoes)) {
    assertEquals(typeof fn, "function", `${nome} deveria ser funcao pela face publica`);
  }
});

Deno.test("F36: as constantes do contrato de retry estao expostas com o valor do plano", () => {
  // O plano D/F42 fixa o teto: 30 s, 2 min, 10 min e dead letter na 4a tentativa.
  assertEquals(MAX_ATTEMPTS, 4);
  assertEquals([...BACKOFF_CEILING_MS], [30_000, 120_000, 600_000]);
});

Deno.test("F36: newCorrelationId e opaco e nao repete dentro de uma rajada", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newCorrelationId()));
  assertEquals(ids.size, 200, "ids de correlacao repetidos na mesma rajada");
  for (const id of ids) {
    assert(id.length >= 8 && !/\s/.test(id), `id de correlacao suspeito: ${id}`);
  }
});
