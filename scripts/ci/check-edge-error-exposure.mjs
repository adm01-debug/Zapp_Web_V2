#!/usr/bin/env node
// E33 do PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01: trava a invariante que fechou o
// alerta de Code Scanning #13 (js/stack-trace-exposure, supabase/functions/_shared/validation.ts).
//
// Contexto: o alerta foi aberto em 05/09/2026 sobre `validation.ts` devolvendo detalhe interno ao
// client. A correção entrou em 28/09 (`211ab6f06`, `internalErrorResponse`) — mas nada no repo
// impedia que um catch novo voltasse a fazer `errorResponse(err.message, 500, req)`. Esta guarda é
// o que impede: ela varre os edges e falha se algum caminho de 5xx devolver mensagem/stack crua.
//
// Uso:
//   node scripts/ci/check-edge-error-exposure.mjs           # varre supabase/functions (exit 1 se achar)
//   node scripts/ci/check-edge-error-exposure.mjs --listar  # só imprime os arquivos varridos
//
// A detecção mora em `acharExposicoes`, função pura: é ela que os testes de unidade exercitam.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ_PADRAO = "supabase/functions";

// Formas de vazar detalhe interno na resposta HTTP.
//
// Regua: 4xx e mensagem para o cliente (o repo ja faz isso: create-user devolve o motivo do
// `auth.admin.createUser` num 400). O que nao pode vazar e detalhe interno num 5xx, ou stack trace
// em qualquer status. O alerta #13 era exatamente disso: err.message indo ao corpo da resposta.
const PADROES = [
  { nome: ".stack na resposta HTTP", re: /errorResponse\s*\([^;]*\.stack\b|JSON\.stringify\s*\([^;]*\.stack\b/ },
  { nome: ".message em resposta 5xx", re: /errorResponse\s*\([^,;]*\.message\s*,\s*5\d\d\b/ },
  { nome: ".message em corpo 500", re: /status\s*:\s*5\d\d[\s\S]{0,120}?\b\w+\.message\b/ },
];

/**
 * Devolve as exposições encontradas num fonte. Função pura — sem I/O, é o contrato dos testes.
 * Uma linha só é considerada exposição se estiver em código: linhas de comentário são ignoradas.
 */
export function acharExposicoes(fonte, arquivo = "arquivo.ts") {
  const achados = [];
  const linhas = fonte.split("\n");
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const semEspaco = linha.trim();
    if (semEspaco.startsWith("//") || semEspaco.startsWith("*") || semEspaco.startsWith("/*")) continue;
    for (const { nome, re } of PADROES) {
      if (re.test(linha)) achados.push({ arquivo, linha: i + 1, padrao: nome, trecho: semEspaco.slice(0, 120) });
    }
  }
  return achados;
}

export function listarFontes(raiz = RAIZ_PADRAO) {
  const arquivos = [];
  const visitar = (dir) => {
    for (const entrada of readdirSync(dir)) {
      const completo = path.join(dir, entrada);
      if (statSync(completo).isDirectory()) visitar(completo);
      else if (/\.ts$/u.test(entrada) && !/\.test\.ts$/u.test(entrada)) arquivos.push(completo);
    }
  };
  visitar(raiz);
  return arquivos.sort();
}

export function main(raiz = RAIZ_PADRAO, argv = process.argv.slice(2)) {
  // Diretorio alvo pode vir como argumento posicional (usado nos testes de mutacao).
  const raizEfetiva = argv.find((a) => !a.startsWith("--")) ?? raiz;
  const fontes = listarFontes(raizEfetiva);
  if (argv.includes("--listar")) {
    console.log(fontes.join("\n"));
    return 0;
  }
  const achados = fontes.flatMap((f) => acharExposicoes(readFileSync(f, "utf8"), f));
  if (achados.length === 0) {
    console.log(`OK: nenhuma exposicao de stack/mensagem interna em ${fontes.length} arquivos de edge.`);
    return 0;
  }
  console.error(`FALHA: ${achados.length} exposicao(oes) de detalhe interno na resposta HTTP:`);
  for (const a of achados) console.error(`  ${a.arquivo}:${a.linha} [${a.padrao}] ${a.trecho}`);
  console.error("Use internalErrorResponse(err, req) de _shared/validation.ts nos catch de 5xx.");
  return 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exit(main());
}
