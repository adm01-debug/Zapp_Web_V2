/**
 * CT-19 — o contador de degradacao e o cabecalho `x-degraded`.
 *
 * Prova que a degradacao NAO passa mais em silencio numa resposta 200. Esse silencio
 * ja custou caro: o limitador da edge falhava aberto, o log registrava o erro, a
 * resposta devolvia 200 e a leitura da medicao concluiu que o rate limit estava
 * funcionando (429=0). O contador existe para que a proxima leitura nao se engane.
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jsonResponse, markDegraded, degradedCounters, resetDegraded } from "./validation.ts";

Deno.test("sem degradacao marcada: nenhum cabecalho novo aparece (aditivo para as outras funcoes)", async () => {
  resetDegraded();
  const res = jsonResponse({ ok: true });
  assertEquals(res.headers.get("x-degraded"), null);
  assertEquals(degradedCounters(), {});
});

Deno.test("degradacao marcada: o total viaja no cabecalho e o corpo continua intacto", async () => {
  resetDegraded();
  markDegraded("rate_limit_store_unavailable");
  markDegraded("rate_limit_store_unavailable");

  const res = jsonResponse({ ok: true });

  assertEquals(res.headers.get("x-degraded"), "rate_limit_store_unavailable=2");
  assertEquals(degradedCounters(), { rate_limit_store_unavailable: 2 });
  // o essencial: marcar degradacao NAO transforma a resposta em erro
  assertEquals(res.status, 200);
  assertEquals(await res.clone().json(), { ok: true });
});

Deno.test("degradacoes distintas aparecem somadas por motivo", async () => {
  resetDegraded();
  markDegraded("a");
  markDegraded("b");
  markDegraded("b");

  const valor = jsonResponse({ ok: true }).headers.get("x-degraded") ?? "";

  assert(valor.includes("a=1"), valor);
  assert(valor.includes("b=2"), valor);
});
