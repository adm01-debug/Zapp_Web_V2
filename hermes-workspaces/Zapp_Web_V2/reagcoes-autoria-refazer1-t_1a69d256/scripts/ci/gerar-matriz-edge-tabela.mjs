#!/usr/bin/env node
// Inventário 23: matriz edge function x tabela. Escaneia supabase/functions/<funcao>/**/*.ts
// (sem testes, sem _shared) e anota cada tabela citada em `.from('tabela')`.
// Uso: node scripts/ci/gerar-matriz-edge-tabela.mjs [--check]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SAIDA = "docs/migration/MATRIZ_EDGE_TABELA.md";
// `(?<!storage)` evita casar `sb.storage.from('bucket')`: bucket de storage não é tabela.
const PADRAO_FROM = /(?<!storage)\.from\(\s*(['"`])([A-Za-z_][\w.]*)\1/g;

export function extrairTabelas(fonte) {
  const tabelas = new Set();
  for (const m of fonte.matchAll(PADRAO_FROM)) tabelas.add(m[2]);
  return tabelas;
}

function listarTs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listarTs(p);
    return e.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(e.name) ? [p] : [];
  });
}

export function montarMatriz(dirFuncoes) {
  const matriz = new Map();
  const funcoes = readdirSync(dirFuncoes, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
  for (const f of funcoes) {
    const tabelas = new Set();
    for (const arq of listarTs(path.join(dirFuncoes, f))) {
      for (const t of extrairTabelas(readFileSync(arq, "utf8"))) tabelas.add(t);
    }
    matriz.set(f, [...tabelas].sort());
  }
  return matriz;
}

export function renderizar(matriz) {
  const porTabela = new Map();
  for (const [f, ts] of matriz) for (const t of ts) porTabela.set(t, [...(porTabela.get(t) ?? []), f]);
  const linhas = [
    "# Matriz edge function x tabela",
    "",
    "> Gerado por `node scripts/ci/gerar-matriz-edge-tabela.mjs` — não editar à mão.",
    "> Fonte: chamadas `.from('tabela')` em `supabase/functions/<funcao>/**/*.ts` (sem testes e sem `_shared`).",
    ">",
    "> Não cobre: tabelas acessadas por `.rpc()` (chamada de função, não de tabela), por nome em variável",
    "> (`from(nome)`) nem por SQL cru. Chamadas `storage.from('bucket')` são bucket de storage, não tabela, e ficam de fora.",
    "",
    "## Por função",
    "",
    "| Função | Tabelas |",
    "|---|---|",
  ];
  for (const [f, ts] of matriz) linhas.push(`| \`${f}\` | ${ts.length ? ts.map((t) => `\`${t}\``).join(", ") : "—"} |`);
  linhas.push("", "## Por tabela", "", "| Tabela | Funções |", "|---|---|");
  for (const t of [...porTabela.keys()].sort()) {
    linhas.push(`| \`${t}\` | ${porTabela.get(t).map((f) => `\`${f}\``).join(", ")} |`);
  }
  return linhas.join("\n") + "\n";
}

export function main(argv = process.argv.slice(2)) {
  const md = renderizar(montarMatriz(path.join(RAIZ, "supabase/functions")));
  const destino = path.join(RAIZ, SAIDA);
  if (argv.includes("--check")) {
    if (!existsSync(destino) || readFileSync(destino, "utf8") !== md) {
      console.error(`${SAIDA} desatualizado: rode node scripts/ci/gerar-matriz-edge-tabela.mjs`);
      return 1;
    }
    return 0;
  }
  writeFileSync(destino, md);
  console.log(`${SAIDA} gerado`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
