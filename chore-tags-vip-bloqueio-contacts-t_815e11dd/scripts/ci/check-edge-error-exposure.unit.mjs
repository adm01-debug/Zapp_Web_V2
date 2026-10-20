import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { acharExposicoes, listarFontes, main } from "./check-edge-error-exposure.mjs";

test("fonte correta com internalErrorResponse não gera achado", () => {
  const fonte = [
    "import { internalErrorResponse } from './validation.ts';",
    "try {",
    "  await fazer();",
    "} catch (err) {",
    "  return internalErrorResponse(err, req);",
    "}",
  ].join("\n");
  assert.deepEqual(acharExposicoes(fonte), []);
});

test(".message num 5xx é achado (o caso do alerta #13)", () => {
  const achados = acharExposicoes("return errorResponse(err.message, 500, req);");
  assert.equal(achados.length, 1);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
  assert.equal(achados[0].linha, 1);
});

test(".stack na resposta HTTP é achado em qualquer status", () => {
  const achados = acharExposicoes("return errorResponse(String(e.stack), 400, req);");
  assert.equal(achados.length, 1);
  assert.equal(achados[0].padrao, ".stack na resposta HTTP");
});

test("JSON com .stack no corpo é achado", () => {
  const achados = acharExposicoes("const body = JSON.stringify({ erro: error.stack });");
  assert.equal(achados.length, 1);
  assert.equal(achados[0].padrao, ".stack na resposta HTTP");
});

test("corpo 500 montado à mão com .message é achado", () => {
  const achados = acharExposicoes("const r = { status: 500, message: err.message };");
  assert.equal(achados.length, 1);
  assert.equal(achados[0].padrao, ".message em corpo 500");
});

test("4xx com mensagem ao cliente NÃO é achado (convenção do repo)", () => {
  // Caso real de supabase/functions/create-user/index.ts:79 — o motivo do
  // auth.admin.createUser vai ao cliente num 400, e isso é intencional.
  const achados = acharExposicoes("return errorResponse(createError.message, 400, req);");
  assert.deepEqual(achados, []);
});

test("comentário que apenas DESCREVE o vazamento não é achado", () => {
  // Caso real de _shared/validation.ts: a docstring cita o bug que corrigiu.
  const fonte = [
    "/** Serializes `err` ... Isolates err.message access * from the Response construction scope so",
    " * CodeQL taint analysis does not trace err.message → Response body (js/stack-trace-exposure). */",
    "// Use no lugar de errorResponse(err.message, 500, req) em todos os catch de 5xx.",
    "  * errorResponse(err.message, 500, req)",
  ].join("\n");
  assert.deepEqual(acharExposicoes(fonte), []);
});

test("conta a linha certa quando o achado está no meio do arquivo", () => {
  const fonte = ["// ok", "const a = 1;", "  return errorResponse(err.message, 503);"].join("\n");
  const achados = acharExposicoes(fonte);
  assert.equal(achados.length, 1);
  assert.equal(achados[0].linha, 3);
});

// ─── R2-INF-016 (item 363) ────────────────────────────────────────────────────────────────
// Respostas 5xx montadas à mão (`new Response`) com o `.message` ANTES do status ou
// atravessando linhas ficavam invisíveis: o scanner antigo só olhava uma linha por vez e
// exigia `status` primeiro. Estes casos são as formas REAIS de searchbox-budget-alert e
// webhook-diagnostic, mais as mutações equivalentes.

test("resposta 500 montada à mão com .message ANTES do status é achado (searchbox-budget-alert)", () => {
  const achados = acharExposicoes("return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500 });");
  assert.equal(achados.length, 1, `esperava 1 achado, veio ${JSON.stringify(achados)}`);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
});

test("resposta 500 montada à mão em VÁRIAS LINHAS é achada (webhook-diagnostic)", () => {
  const fonte = [
    "  } catch (err) {",
    "    return new Response(",
    "      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),",
    "      {",
    "        status: 500,",
    "        headers: cors,",
    "      },",
    "    );",
    "  }",
  ].join("\n");
  const achados = acharExposicoes(fonte);
  assert.equal(achados.length, 1, `esperava 1 achado, veio ${JSON.stringify(achados)}`);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
  assert.equal(achados[0].linha, 2);
});

test("resposta 500 com template em volta do .message é achada (talkx-send)", () => {
  const achados = acharExposicoes("return new Response(JSON.stringify({ error: `claim_failed: ${claimError.message}` }), { status: 500, headers });");
  assert.equal(achados.length, 1, `esperava 1 achado, veio ${JSON.stringify(achados)}`);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
});

test("resposta 500 com stack é achada mesmo montada à mão", () => {
  const achados = acharExposicoes("return new Response(JSON.stringify({ erro: err.stack }), { status: 500 });");
  assert.equal(achados.length, 1, `esperava 1 achado, veio ${JSON.stringify(achados)}`);
  assert.equal(achados[0].padrao, ".stack na resposta HTTP");
});

test("jsonResponse com .message no corpo num 5xx é achado (o status é o SEGUNDO argumento)", () => {
  // `jsonResponse(corpo, 5xx, req)` não sanitiza: só o corpo vindo de construtor de
  // envelope documentado da IA (IA-026/IA-027) é aceito. Objeto literal é achado.
  const achados = acharExposicoes("return jsonResponse({ error: err.message }, 503, req);");
  assert.equal(achados.length, 1, `esperava 1 achado, veio ${JSON.stringify(achados)}`);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
});

test("jsonResponse com envelope documentado NÃO é achado (IA-026/IA-027: contrato, não catch)", () => {
  // O campo `error` do envelope é mensagem de capacidade escrita no call site — a lista
  // de construtores aceitos é fechada e por nome (buildAiEnvelope / persistenceFailureEnvelope).
  const fonte = "return jsonResponse(persistenceFailureEnvelope({ capability, error: input.message, context }), 502, req);";
  assert.deepEqual(acharExposicoes(fonte), []);
  const fonteBuild = "return jsonResponse(buildAiEnvelope({ capability, status: 'error', error: input.message, context }), 502, req);";
  assert.deepEqual(acharExposicoes(fonteBuild), []);
});

test("jsonResponse com builder NÃO documentado carregando .message num 5xx é achado", () => {
  // A exceção é por NOME de função: uma fábrica qualquer não herda a fronteira da IA.
  const achados = acharExposicoes("return jsonResponse(meuBuilder({ error: err.message }), 500, req);");
  assert.equal(achados.length, 1, `esperava 1 achado, veio ${JSON.stringify(achados)}`);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
});

test("jsonResponse com .message fora de 5xx NÃO é achado (2xx/4xx seguem liberados)", () => {
  assert.deepEqual(acharExposicoes("return jsonResponse({ error: err.message }, 200, req);"), []);
  assert.deepEqual(acharExposicoes("return jsonResponse({ error: err.message }, 400, req);"), []);
});

test("R2-INF-016: o conteúdo REAL de ai-conversation-pipeline.ts está limpo — e a regressão dele é acusada", () => {
  // A pipeline de IA usa `jsonResponse(envelope, 502, req)` de verdade: prova que a guarda
  // enxerga o arquivo real sem acusar o envelope documentado e que, se o corpo voltasse a
  // ser um objeto literal com o detalhe interno, a varredura reprovaria.
  const caminho = "supabase/functions/_shared/ai-conversation-pipeline.ts";
  const fonte = readFileSync(caminho, "utf8");
  const envelope = "persistenceFailureEnvelope({ capability: input.capability, error: input.message, context: input.context })";
  assert.ok(fonte.includes(envelope), `${caminho} deveria chamar o construtor de envelope documentado`);
  assert.deepEqual(acharExposicoes(fonte, caminho), [], `${caminho} não deveria expor detalhe interno`);
  const comRegressao = fonte.replace(envelope, "{ error: err.message }");
  assert.notEqual(comRegressao, fonte, `${caminho}: o envelope precisa ser substituível`);
  const achados = acharExposicoes(comRegressao, caminho);
  assert.equal(achados.length, 1, `${caminho}: a guarda deveria reprovar a regressão, veio ${JSON.stringify(achados)}`);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
});

test("resposta 500 montada à mão SEM detalhe interno não é achado", () => {
  const achados = acharExposicoes('return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });');
  assert.deepEqual(achados, []);
});

test("resposta 4xx montada à mão com .message não é achado (convenção do repo)", () => {
  const achados = acharExposicoes("return new Response(JSON.stringify({ error: err.message }), { status: 400 });");
  assert.deepEqual(achados, []);
});

test("R2-INF-016: o conteúdo REAL dos dois arquivos citados está limpo — e a regressão deles é acusada", () => {
  // Chamadas com o conteúdo de verdade lido do disco (não uma cópia feita à mão): prova que a
  // guarda enxerga o arquivo real e que, se ele voltasse à forma antiga, a varredura reprovaria.
  // Cada alvo mapeia a chamada sanitizante atual -> a forma que existia antes da correção.
  const alvos = [
    {
      caminho: "supabase/functions/searchbox-budget-alert/index.ts",
      atual: "return internalErrorResponse(error, req);",
      antigo: "return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500 });",
    },
    {
      caminho: "supabase/functions/webhook-diagnostic/index.ts",
      atual: "return internalErrorResponse(err, req);",
      antigo: [
        "return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {",
        "      status: 500,",
        "    });",
      ].join("\n"),
    },
  ];
  for (const { caminho, atual, antigo } of alvos) {
    const fonte = readFileSync(caminho, "utf8");
    assert.ok(fonte.includes(atual), `${caminho} deveria chamar o helper sanitizante`);
    assert.deepEqual(acharExposicoes(fonte, caminho), [], `${caminho} nao deveria expor detalhe interno`);
    const comRegressao = fonte.replace(atual, antigo);
    assert.notEqual(comRegressao, fonte, `${caminho}: a forma antiga precisa ser substituivel`);
    assert.equal(
      acharExposicoes(comRegressao, caminho).length,
      1,
      `${caminho}: a guarda deveria reprovar o arquivo REAL se ele voltasse a montar o 500 a mao`,
    );
  }
});

test("a varredura real dos edges passa (a correção de 28/09 se mantém)", () => {
  const fontes = listarFontes();
  assert.ok(fontes.length > 10, `esperava varrer vários edges, varreu ${fontes.length}`);
  assert.equal(main("supabase/functions", []), 0, "há exposição de detalhe interno nos edges");
});

test("MUTAÇÃO: as duas formas reais (searchbox e webhook-diagnostic) reprovam a varredura", () => {
  const raiz = mkdtempSync(path.join(tmpdir(), "edge-exposure-r2inf016-"));
  mkdirSync(path.join(raiz, "searchbox-budget-alert"), { recursive: true });
  mkdirSync(path.join(raiz, "webhook-diagnostic"), { recursive: true });
  writeFileSync(
    path.join(raiz, "searchbox-budget-alert", "index.ts"),
    "export const x = (err) => new Response(JSON.stringify({ ok: false, erro: err.message }), { status: 500 });\n",
  );
  writeFileSync(
    path.join(raiz, "webhook-diagnostic", "index.ts"),
    [
      "export const y = (err) => {",
      "  return new Response(",
      "    JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),",
      "    { status: 500 },",
      "  );",
      "};",
      "",
    ].join("\n"),
  );
  assert.equal(main(raiz, []), 1, "a guarda deveria reprovar as duas formas reais");
  // Sanitizadas pelo helper, as duas passam: prova que a reprovação vem do corpo, não do caminho.
  writeFileSync(path.join(raiz, "searchbox-budget-alert", "index.ts"), "export const x = (err, req) => internalErrorResponse(err, req);\n");
  writeFileSync(path.join(raiz, "webhook-diagnostic", "index.ts"), "export const y = (err, req) => internalErrorResponse(err, req);\n");
  assert.equal(main(raiz, []), 0, "as duas fontes sanitizadas deveriam passar");
});

// O teste acima não substitui a varredura real: ele prova que a DETECÇÃO funciona. A ausência
// de achados no repositório só é evidência junto com esta mutação (item 363 · acceptance 3).

test("MUTAÇÃO: vazamento injetado num edge de verdade é detectado (e o diretório é respeitado)", () => {
  const raiz = mkdtempSync(path.join(tmpdir(), "edge-exposure-"));
  mkdirSync(path.join(raiz, "create-user"), { recursive: true });
  writeFileSync(
    path.join(raiz, "create-user", "index.ts"),
    "export const x = (err) => errorResponse(err.message, 500, req);\n",
  );
  assert.equal(main(raiz, []), 1, "a guarda deveria reprovar a mutação injetada");
  // O mesmo diretório, sem a linha, passa: prova que a falha acima é do conteúdo, não do caminho.
  writeFileSync(path.join(raiz, "create-user", "index.ts"), "export const x = (err) => internalErrorResponse(err, req);\n");
  assert.equal(main(raiz, []), 0, "fonte limpa deveria passar");
});
