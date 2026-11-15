/**
 * CV-010: Testes unitários do gate de capacidade `copilot_live`.
 *
 * Cobre: mapeamento de função → chave, comportamento do gate com flag
 * desligada, ligada, ausente e falha de leitura.
 */
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  AI_CAPABILITY_FLAG_PREFIX,
  AI_CAPABILITY_BY_FUNCTION,
  aiCapabilityFlagKey,
  capabilityFlagKeyForFunction,
  enforceAiCapability,
  type CapabilityFlagReader,
} from "../ai-feature-flags.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(): Request {
  return new Request("https://example.com/copilot-live", { method: "POST" });
}

function flagReader(value: boolean | null): CapabilityFlagReader {
  return async (_key: string) => value;
}

// ---------------------------------------------------------------------------
// 1. Mapeamento copilot-live → copilot_live
// ---------------------------------------------------------------------------

Deno.test("CV-010: copilot-live está no mapa de capacidades", () => {
  assertEquals(AI_CAPABILITY_BY_FUNCTION["copilot-live"], "copilot_live");
});

Deno.test("CV-010: capabilityFlagKeyForFunction retorna a chave correta", () => {
  const key = capabilityFlagKeyForFunction("copilot-live");
  assertEquals(key, `${AI_CAPABILITY_FLAG_PREFIX}copilot_live`);
  assertEquals(key, "ai.capability.copilot_live");
});

/**
 * CV-081-102: as 7 edges de análise contextual do RADAR consomem a MESMA
 * capacidade. Sem entrada no mapa `capabilityFlagKeyForFunction` devolve `null`
 * e o gate LIBERA a função — a chave desligada não barraria o provedor pago.
 */
const EDGES_DO_RADAR = [
  "ai-objection-handler",
  "ai-price-anchor",
  "ai-loss-risk",
  "ai-product-recommendation",
  "ai-deadline-calculator",
  "ai-lead-temperature",
  "ai-multimodal-analysis",
] as const;

Deno.test("CV-081-102: as 7 edges do RADAR estão no mapa sob copilot_live", () => {
  for (const fn of EDGES_DO_RADAR) {
    assertEquals(AI_CAPABILITY_BY_FUNCTION[fn], "copilot_live", fn);
    assertEquals(capabilityFlagKeyForFunction(fn), "ai.capability.copilot_live", fn);
  }
});

Deno.test("CV-081-102: flag=false bloqueia as 7 edges do RADAR com 503", async () => {
  for (const fn of EDGES_DO_RADAR) {
    const resp = await enforceAiCapability({
      functionName: fn,
      req: mockReq(),
      readFlag: flagReader(false),
    });
    assertNotEquals(resp, null, fn);
    assertEquals(resp!.status, 503, fn);
    const body = await resp!.json();
    assertEquals(body.code, "AI_CAPABILITY_DISABLED", fn);
  }
});

Deno.test("CV-010: função desconhecida não retorna chave", () => {
  assertEquals(capabilityFlagKeyForFunction("funcao-inexistente"), null);
});

Deno.test("CV-010: aiCapabilityFlagKey gera o prefixo correto", () => {
  assertEquals(aiCapabilityFlagKey("copilot_live"), "ai.capability.copilot_live");
});

// ---------------------------------------------------------------------------
// 2. Gate: flag DESLIGADA bloqueia
// ---------------------------------------------------------------------------

Deno.test("CV-010: flag=false bloqueia com 503", async () => {
  const resp = await enforceAiCapability({
    functionName: "copilot-live",
    req: mockReq(),
    readFlag: flagReader(false),
  });
  assertNotEquals(resp, null);
  assertEquals(resp!.status, 503);
  const body = await resp!.json();
  assertEquals(body.code, "AI_CAPABILITY_DISABLED");
});

// ---------------------------------------------------------------------------
// 3. Gate: flag LIGADA permite
// ---------------------------------------------------------------------------

Deno.test("CV-010: flag=true permite (retorna null)", async () => {
  const resp = await enforceAiCapability({
    functionName: "copilot-live",
    req: mockReq(),
    readFlag: flagReader(true),
  });
  assertEquals(resp, null);
});

// ---------------------------------------------------------------------------
// 4. Gate: linha AUSENTE (null do leitor) também bloqueia — fail-closed
// ---------------------------------------------------------------------------

Deno.test("CV-010: falha de leitura (null) bloqueia com 503 — fail-closed", async () => {
  const resp = await enforceAiCapability({
    functionName: "copilot-live",
    req: mockReq(),
    readFlag: flagReader(null),
  });
  assertNotEquals(resp, null);
  assertEquals(resp!.status, 503);
});

// ---------------------------------------------------------------------------
// 5. Gate: leitor que lança também bloqueia — fail-closed
// ---------------------------------------------------------------------------

Deno.test("CV-010: leitor que lança exceção bloqueia com 503 — fail-closed", async () => {
  const throwingReader: CapabilityFlagReader = async (_key) => {
    throw new Error("PostgREST indisponível");
  };
  const resp = await enforceAiCapability({
    functionName: "copilot-live",
    req: mockReq(),
    readFlag: throwingReader,
  });
  assertNotEquals(resp, null);
  assertEquals(resp!.status, 503);
});

// ---------------------------------------------------------------------------
// 6. Funções sem capacidade declarada não são bloqueadas
// ---------------------------------------------------------------------------

Deno.test("CV-010: função sem capacidade no mapa não é bloqueada", async () => {
  const resp = await enforceAiCapability({
    functionName: "ai-proxy",
    req: mockReq(),
    readFlag: flagReader(false), // mesmo com flag false, não bloqueia
  });
  assertEquals(resp, null);
});
