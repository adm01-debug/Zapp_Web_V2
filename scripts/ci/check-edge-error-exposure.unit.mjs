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
  const achados = acharExposicoes("return new Response(JSON.stringify({ error: err.message }), { status: 500 });");
  assert.equal(achados.length, 1);
  assert.equal(achados[0].padrao, ".message em resposta 5xx");
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

test("resposta 500 montada à mão com .message ANTES do status é achada (searchbox-budget-alert)", () => {
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

test("jsonResponse com .message num 5xx é achado (sem exceção de segurança)", () => {
  const achados = acharExposicoes("return jsonResponse({ error: err.message }, 503, req);");
  assert.equal(achados.length, 1, `esperava 1 achado, veio ${JSON.stringify(achados)}`);
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

test("MUTAÇÃO: as formas reais e jsonResponse 5xx reprovam a varredura", () => {
  const raiz = mkdtempSync(path.join(tmpdir(), "edge-exposure-r2inf016-"));
  mkdirSync(path.join(raiz, "searchbox-budget-alert"), { recursive: true });
  mkdirSync(path.join(raiz, "webhook-diagnostic"), { recursive: true });
  mkdirSync(path.join(raiz, "ia-pipeline"), { recursive: true });
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
  writeFileSync(
    path.join(raiz, "ia-pipeline", "index.ts"),
    "export const z = (err, req) => jsonResponse({ error: err.message }, 503, req);\n",
  );
  assert.equal(main(raiz, []), 1, "a guarda deveria reprovar as três formas com detalhe interno");
  writeFileSync(path.join(raiz, "searchbox-budget-alert", "index.ts"), "export const x = (err, req) => internalErrorResponse(err, req);\n");
  writeFileSync(path.join(raiz, "webhook-diagnostic", "index.ts"), "export const y = (err, req) => internalErrorResponse(err, req);\n");
  writeFileSync(path.join(raiz, "ia-pipeline", "index.ts"), "export const z = (_err, req) => jsonResponse({ error: 'Internal server error' }, 503, req);\n");
  assert.equal(main(raiz, []), 0, "fontes sanitizadas deveriam passar");
});
