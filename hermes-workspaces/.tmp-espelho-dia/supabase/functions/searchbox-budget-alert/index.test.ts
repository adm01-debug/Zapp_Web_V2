/**
 * R2-INF-016 (item 363) — contrato executável do searchbox-budget-alert.
 *
 * Antes da correção a falha da consulta devolvia
 * `new Response(JSON.stringify({ erro: error.message }), { status: 500 })`: detalhe interno do
 * banco no corpo, com o status DEPOIS da mensagem — forma que a guarda
 * `scripts/ci/check-edge-error-exposure.mjs` não enxergava. Aqui se prova o handler real: o
 * corpo é sanitizado e o detalhe não sai.
 *
 * Roda sem rede: o `fetch` global é substituído por um stub que responde o erro sintético
 * (o client do Supabase é construído de verdade, então o caminho exercitado é o de produção).
 */
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleSearchboxBudgetAlert } from "./index.ts";

const SEGREDO = "detalhe-interno-do-banco-9f3a";
const CRON_SECRET = "cron-secret-de-teste";

Deno.env.set("CRON_SECRET", CRON_SECRET);
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-de-teste");

Deno.test("R2-INF-016: falha da consulta de uso → 500 sanitizado (sem detalhe interno)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: SEGREDO, code: "XX000" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
  const linhas: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { linhas.push(args.map((a) => String(a)).join(" ")); };
  try {
    const req = new Request("http://localhost/functions/v1/searchbox-budget-alert", {
      headers: { "x-cron-secret": CRON_SECRET },
    });
    const res = await handleSearchboxBudgetAlert(req);
    assertEquals(res.status, 500, "falha da consulta deve virar 500");
    const texto = await res.text();
    assertEquals(texto.includes(SEGREDO), false, `o corpo não pode trazer o detalhe interno: ${texto}`);
    assertEquals(JSON.parse(texto).error, "Internal server error", `corpo inesperado: ${texto}`);
    assert(
      linhas.some((l) => l.includes(SEGREDO)),
      `o detalhe interno precisa constar no log do servidor; capturado:\n${linhas.join("\n")}`,
    );
  } finally {
    console.error = originalError;
    globalThis.fetch = original;
  }
});
