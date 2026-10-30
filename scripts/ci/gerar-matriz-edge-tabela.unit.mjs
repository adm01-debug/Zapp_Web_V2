import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { montarMatriz, renderizar } from "./gerar-matriz-edge-tabela.mjs";

function criarFuncoesFalsas() {
  const dir = mkdtempSync(path.join(tmpdir(), "edge-matriz-"));
  mkdirSync(path.join(dir, "fn-a"));
  mkdirSync(path.join(dir, "fn-b"));
  mkdirSync(path.join(dir, "_shared"));
  writeFileSync(
    path.join(dir, "fn-a", "index.ts"),
    "await sb.from('contacts').select();\nawait sb\n  .from(\"messages\").insert({});\nawait sb.storage.from('storage_bucket').upload('k', new Blob());\n",
  );
  writeFileSync(path.join(dir, "fn-a", "index.test.ts"), "sb.from('ignorada')");
  writeFileSync(path.join(dir, "fn-b", "index.ts"), "sb.from('contacts'); sb.from('profiles');");
  writeFileSync(path.join(dir, "_shared", "x.ts"), "sb.from('shared_nao_conta')");
  return dir;
}

test("matriz de 2 funções falsas lista as tabelas certas", () => {
  const matriz = montarMatriz(criarFuncoesFalsas());
  assert.deepEqual([...matriz], [
    ["fn-a", ["contacts", "messages"]],
    ["fn-b", ["contacts", "profiles"]],
  ]);
});

test("markdown cruza função x tabela nos dois sentidos", () => {
  const md = renderizar(montarMatriz(criarFuncoesFalsas()));
  assert.match(md, /\| `fn-a` \| `contacts`, `messages` \|/);
  assert.match(md, /\| `contacts` \| `fn-a`, `fn-b` \|/);
  assert.doesNotMatch(md, /ignorada|shared_nao_conta|storage_bucket/);
});
