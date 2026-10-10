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

test("a varredura real dos edges passa (a correção de 28/09 se mantém)", () => {
  const fontes = listarFontes();
  assert.ok(fontes.length > 10, `esperava varrer vários edges, varreu ${fontes.length}`);
  assert.equal(main("supabase/functions", []), 0, "há exposição de detalhe interno nos edges");
});

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
