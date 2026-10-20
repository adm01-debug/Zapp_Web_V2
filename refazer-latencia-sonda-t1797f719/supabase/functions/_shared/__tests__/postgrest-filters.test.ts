import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { escapeOrFilterValue } from "../postgrest-filters.ts";

// voice-copilot-action/search_contacts só removia % _ \, sem tocar em
// vírgula/parênteses/aspas — um termo como `x",is_admin.eq.true,name.ilike."%`
// injetava uma cláusula OR arbitrária no filtro. Achado da auditoria de 5
// agentes (2026-09-26), extensão do fix do #917 (useCallHistory.ts).

Deno.test("escapeOrFilterValue envolve um valor simples em aspas duplas", () => {
  assertEquals(escapeOrFilterValue("Silva"), '"Silva"');
});

Deno.test("escapeOrFilterValue neutraliza vírgula que injetaria condição OR irmã", () => {
  const injected = escapeOrFilterValue('x",is_admin.eq.true,name.ilike."%');
  assertEquals(injected, '"x\\",is_admin.eq.true,name.ilike.\\"%"');
});

Deno.test("escapeOrFilterValue escapa aspas duplas embutidas", () => {
  assertEquals(escapeOrFilterValue('João "Doidão"'), '"João \\"Doidão\\""');
});

Deno.test("escapeOrFilterValue escapa barra invertida sem deixar a aspa desprotegida", () => {
  assertEquals(escapeOrFilterValue("C:\\"), '"C:\\\\"');
});

Deno.test("escapeOrFilterValue deixa parênteses inertes depois de citado", () => {
  assertEquals(escapeOrFilterValue("(is_admin.eq.true)"), '"(is_admin.eq.true)"');
});
