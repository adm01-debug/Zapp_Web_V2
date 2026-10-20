/**
 * N-206: Testes para o bootstrap comum das Edge Functions (edge-boot).
 *
 * Provas:
 *   1. Cliente preguiçoso — makeClient NÃO é chamado quando supabase é injetado.
 *   2. Headers de CORS da allowlist — origin permitido entra no Access-Control-Allow-Origin.
 *   3. Logger presente — log tem os métodos esperados.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bootEdge } from "../edge-boot.ts";
import type { EdgeInjected } from "../edge-boot.ts";

// ─── Cliente preguiçoso ──────────────────────────────────────────

Deno.test("edge-boot: makeClient NÃO é chamado quando supabase é injetado", () => {
  let makeClientCalled = false;
  const makeClient = () => {
    makeClientCalled = true;
    return {} as unknown as EdgeInjected<unknown>["supabase"];
  };

  const req = new Request("http://localhost:8000/functions/v1/test", { method: "GET" });
  const injectedSupabase = { from: () => ({ select: () => ({ data: null, error: null }) }) } as unknown as EdgeInjected<unknown>["supabase"];

  const result = bootEdge(req, {
    fnName: "test",
    injected: { supabase: injectedSupabase },
    makeClient,
  });

  assertEquals(makeClientCalled, false, "makeClient não deve ser chamado quando supabase é injetado");
  assertEquals(result.supabase, injectedSupabase);
});

// ─── Headers de CORS da allowlist ────────────────────────────────

Deno.test("edge-boot: headers de CORS usam origin da allowlist quando permitido", () => {
  const req = new Request("http://localhost:8000/functions/v1/test", {
    method: "GET",
    headers: { Origin: "http://localhost:3000" },
  });

  const result = bootEdge(req, {
    fnName: "test",
    makeClient: () => ({} as unknown as EdgeInjected<unknown>["supabase"]),
  });

  assertExists(result.headers["Access-Control-Allow-Origin"]);
  assertEquals(result.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
});

Deno.test("edge-boot: headers de CORS usam fallback quando origin nao esta na allowlist", () => {
  const req = new Request("http://localhost:8000/functions/v1/test", {
    method: "GET",
    headers: { Origin: "https://evil.example.com" },
  });

  const result = bootEdge(req, {
    fnName: "test",
    makeClient: () => ({} as unknown as EdgeInjected<unknown>["supabase"]),
  });

  assertExists(result.headers["Access-Control-Allow-Origin"]);
  assertEquals(result.headers["Access-Control-Allow-Origin"], "https://zapp-web-v2.vercel.app");
});

// ─── Logger presente ─────────────────────────────────────────────

Deno.test("edge-boot: logger esta presente e tem os metodos esperados", () => {
  const req = new Request("http://localhost:8000/functions/v1/test", { method: "GET" });

  const result = bootEdge(req, {
    fnName: "testFunction",
    makeClient: () => ({} as unknown as EdgeInjected<unknown>["supabase"]),
  });

  assertExists(result.log);
  assertEquals(typeof result.log.info, "function");
  assertEquals(typeof result.log.debug, "function");
  assertEquals(typeof result.log.warn, "function");
  assertEquals(typeof result.log.error, "function");
  assertEquals(typeof result.log.done, "function");
});