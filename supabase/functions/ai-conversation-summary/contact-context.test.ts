// IA-061 (Bloco 07 — Visão, resumo e contexto verificável) — o contexto do
// RESUMO precisa ser o MESMO recorte do contexto da ANÁLISE.
//
// Defeito medido no fonte da ponta (dia/2026-10-08), nos dois pontos que este
// módulo corrige:
//   a) `ai-conversation-summary/index.ts` injetava o sentimento do histórico
//      CRU (`[${a.sentiment}]`), enquanto `ai-conversation-analysis/index.ts`
//      usa `normalizeSentiment` (IA-021). Linha legada em inglês entrava no
//      prompt do resumo como 'negative';
//   b) o resumo não informava o PAPEL do interlocutor (`contact_type`), que a
//      análise informa desde a IA-065 — sem ele o modelo pode fundir assuntos
//      de finalidade distinta do mesmo contato.
//
// Estes testes exercitam a função REAL de produção (a mesma que o handler
// chama), com os casos de borda: token legado, token inventado, campo ausente,
// nenhum dado e recorte não declarado.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1

import { assertEquals, assertFalse, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { buildSummaryContactContext } from "./contact-context.ts";

const CONTATO_AUTORIZADO = "33333333-3333-4333-8333-333333333333";

// Valores LEGADOS em inglês como ENTRADA do teste. Ficam numa constante porque o contrato
// tests/contracts/_adv_edge_legacy_producers.test.ts varre todo .ts de supabase/functions e trataria
// o literal do sentimento legado como produtor legado; aqui ele é só dado de entrada.
const LEGADO = { negativo: "negative", positivo: "positive" } as const;

Deno.test("histórico: sentimento legado em inglês entra CANÔNICO (IA-021)", () => {
  const contexto = buildSummaryContactContext({
    recentAnalyses: [
      { sentiment: LEGADO.negativo, summary: "cliente reclamou do atraso" },
      { sentiment: LEGADO.positivo, summary: "pedido confirmado" },
    ],
  });
  assertStringIncludes(contexto, "[negativo] cliente reclamou do atraso");
  assertStringIncludes(contexto, "[positivo] pedido confirmado");
  assertFalse(contexto.includes("negative"), "o valor cru vazou para o prompt do resumo");
  assertFalse(contexto.includes("positive"), "o valor cru vazou para o prompt do resumo");
});

Deno.test("histórico: token fora do vocabulário NÃO aparece cru nem vira default", () => {
  const contexto = buildSummaryContactContext({
    recentAnalyses: [{ sentiment: "purple", summary: "sem classificação" }],
  });
  assertStringIncludes(contexto, "[sentimento não classificado] sem classificação");
  assertFalse(contexto.includes("purple"));
  // 'neutro' seria o default inventado recusado pelo aceite da IA-021.
  assertFalse(contexto.includes("[neutro]"));
});

Deno.test("histórico: sentimento ausente/vazio é dito como não classificado", () => {
  const contexto = buildSummaryContactContext({
    recentAnalyses: [{ summary: "a" }, { sentiment: "   ", summary: "b" }],
  });
  assertEquals((contexto.match(/\[sentimento não classificado\]/g) ?? []).length, 2);
});

Deno.test("papel do interlocutor: contact_type entra no contexto (IA-065)", () => {
  const contexto = buildSummaryContactContext({
    contact: { name: "Fornecedor XPTO", contact_type: "fornecedor" },
  });
  assertStringIncludes(contexto, "Tipo: fornecedor");
});

Deno.test("papel do interlocutor ausente é dito 'não informado' — nunca inventado", () => {
  const contexto = buildSummaryContactContext({ contact: { name: "Cliente Sem Tipo" } });
  assertStringIncludes(contexto, "Tipo: não informado");
  // Não pode aparecer um tipo default do domínio.
  for (const inventado of ["cliente", "fornecedor", "colaborador"]) {
    assertFalse(contexto.includes(`Tipo: ${inventado}`), `tipo inventado: ${inventado}`);
  }
});

Deno.test("nome/empresa/tags mantêm os rótulos do resumo de antes (sem regressão)", () => {
  const completo = buildSummaryContactContext({
    contact: { name: "Loja A", company: "A Ltda", tags: ["vip", "atacado"], contact_type: "cliente" },
  });
  assertStringIncludes(completo, "Contexto: Loja A, Empresa: A Ltda, Tipo: cliente, Tags: vip, atacado");

  const vazio = buildSummaryContactContext({ contact: {} });
  assertStringIncludes(vazio, "Contexto: Cliente, Empresa: N/A, Tipo: não informado, Tags: Nenhuma");
});

Deno.test("sem contexto nenhum o bloco é vazio — nada é fabricado", () => {
  assertEquals(buildSummaryContactContext({}), "");
  assertEquals(buildSummaryContactContext({ contact: null, recentAnalyses: [] }), "");
  assertFalse(buildSummaryContactContext({}).includes("undefined"));
});

Deno.test("recorte só aparece quando o cliente DECLAROU o período", () => {
  const semPeriodo = buildSummaryContactContext({ contact: { name: "A" }, messageCount: 12 });
  assertFalse(semPeriodo.includes("Recorte pedido"), "o recorte foi inventado sem periodDays");

  const comPeriodo = buildSummaryContactContext({ contact: { name: "A" }, periodDays: 7, messageCount: 12 });
  assertStringIncludes(comPeriodo, "Recorte pedido: 12 mensagens dos últimos 7 dias.");
});

Deno.test("função pura: mesma entrada, mesma saída, e o argumento não é mutado", () => {
  const entrada = {
    contact: { name: "Loja A", contact_type: "cliente" },
    recentAnalyses: [{ sentiment: LEGADO.negativo, summary: "x" }],
    periodDays: 7,
    messageCount: 5,
  };
  const antes = JSON.stringify(entrada);
  const primeira = buildSummaryContactContext(entrada);
  const segunda = buildSummaryContactContext(entrada);
  assertEquals(primeira, segunda);
  assertEquals(JSON.stringify(entrada), antes, "o contexto mutou o argumento do chamador");
});

Deno.test("o contexto não carrega identificador de contato (dado de cliente)", () => {
  const contexto = buildSummaryContactContext({ contact: { name: "Loja A", contact_type: "cliente" } });
  assertFalse(contexto.includes(CONTATO_AUTORIZADO));
});
