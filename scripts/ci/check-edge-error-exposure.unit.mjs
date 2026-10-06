import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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

test("jsonResponse NÃO entra nesta varredura (fronteira documentada: envelope da IA é contrato)", () => {
  // `jsonResponse(corpo, 5xx, req)` não sanitiza, mas o corpo do envelope de erro da pipeline
  // de IA (IA-026/IA-027) é contrato documentado e sai de um construtor de envelope. Fica
  // fora desta guarda — achado registrado no cartão, não silenciado.
  const achados = acharExposicoes("return jsonResponse({ error: err.message }, 503, req);");
  assert.deepEqual(achados, []);
});

test("resposta 500 montada à mão SEM detalhe interno não é achado", () => {
  const achados = acharExposicoes('return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });');
  assert.deepEqual(achados, []);
});

test("resposta 4xx montada à mão com .message não é achado (convenção do repo)", () => {
  const achados = acharExposicoes("return new Response(JSON.stringify({ error: err.message }), { status: 400 });");
  assert.deepEqual(achados, []);
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
