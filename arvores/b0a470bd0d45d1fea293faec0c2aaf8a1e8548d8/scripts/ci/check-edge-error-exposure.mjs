#!/usr/bin/env node
// E33 do PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01: trava a invariante que fechou o
// alerta de Code Scanning #13 (js/stack-trace-exposure, supabase/functions/_shared/validation.ts).
//
// Contexto: o alerta foi aberto em 05/09/2026 sobre `validation.ts` devolvendo detalhe interno ao
// client. A correção entrou em 28/09 (`211ab6f06`, `internalErrorResponse`) — mas nada no repo
// impedia que um catch novo voltasse a fazer `errorResponse(err.message, 500, req)`. Esta guarda é
// o que impede: ela varre os edges e falha se algum caminho de 5xx devolver mensagem/stack crua.
//
// R2-INF-016 (item 363): a primeira versão da guarda olhava UMA linha por vez e exigia o `status`
// antes do `.message`, então a resposta 5xx montada à mão — `new Response(JSON.stringify({erro:
// error.message}), {status: 500})` (ordem oposta) e a versão multi-linha — ficava invisível e o
// repositório podia conter o vazamento com a frase "nenhuma exposição" impressa. Agora a guarda
// lê a chamada inteira (argumentos balanceados, qualquer ordem, qualquer número de linhas).
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

// Formas de vazar detalhe interno na resposta HTTP (varredura por linha, legado).
//
// Regua: 4xx e mensagem para o cliente (o repo ja faz isso: create-user devolve o motivo do
// `auth.admin.createUser` num 400). O que nao pode vazar e detalhe interno num 5xx, ou stack trace
// em qualquer status. O alerta #13 era exatamente disso: err.message indo ao corpo da resposta.
const PADROES = [
  { nome: ".stack na resposta HTTP", re: /errorResponse\s*\([^;]*\.stack\b|JSON\.stringify\s*\([^;]*\.stack\b/ },
  { nome: ".message em resposta 5xx", re: /errorResponse\s*\([^,;]*\.message\s*,\s*5\d\d\b/ },
  { nome: ".message em corpo 500", re: /status\s*:\s*5\d\d[^\n]{0,120}?\b\w+\.message\b/ },
];

// Respostas montadas à mão ou via helper que não sanitiza. `new Response(corpo,
// { status: 5xx })` e `jsonResponse(corpo, 5xx, req)` entram como um bloco só: a
// ordem dos argumentos e o número de linhas não importam. No `jsonResponse` o
// status é o SEGUNDO argumento (`jsonResponse(corpo, 503, req)`), não um
// `status: 5xx` dentro de objeto.
//
// ÚNICA exceção no `jsonResponse`, explícita e enumerada por nome de função: corpo
// que é uma CHAMADA a um construtor de envelope documentado do contrato de IA
// (IA-026/IA-027) — `buildAiEnvelope` e `persistenceFailureEnvelope`. O campo
// `error` desse envelope é mensagem de capacidade escrita no call site, não o
// `message` de um `catch`. Qualquer outro corpo (objeto literal, template, ou
// chamada a função fora dessa lista) com `.message`/`.stack` num 5xx é achado.
// `errorResponse(msg, 5xx)` já é coberto pelos PADROES acima.
const RESPOSTAS_MANUAIS = /\bnew\s+Response\s*\(|\bjsonResponse\s*\(/gu;

// Construtores de envelope documentados aceitos como corpo do `jsonResponse`
// (lista fechada, por nome de função — envelope novo precisa entrar aqui).
const ENVELOPES_DOCUMENTADOS = /^\s*(?:[\w$]+\.)*(?:buildAiEnvelope|persistenceFailureEnvelope)\s*\(/u;

/**
 * Troca comentários por espaços preservando as quebras de linha (o número da linha não muda).
 * Preserva strings/templates: um `${err.message}` dentro de template continua visível.
 */
function limparComentarios(fonte) {
  let saida = "";
  let i = 0;
  let emString = null;
  let escapado = false;
  let emBloco = false;
  let emLinha = false;
  while (i < fonte.length) {
    const c = fonte[i];
    const d = fonte[i + 1];
    if (emBloco) {
      if (c === "*" && d === "/") {
        saida += "  ";
        i += 2;
        emBloco = false;
        continue;
      }
      saida += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
    if (emLinha) {
      if (c === "\n") {
        saida += "\n";
        emLinha = false;
        i += 1;
        continue;
      }
      saida += " ";
      i += 1;
      continue;
    }
    if (emString) {
      saida += c;
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === emString) emString = null;
      i += 1;
      continue;
    }
    if (c === "/" && d === "/") {
      emLinha = true;
      saida += "  ";
      i += 2;
      continue;
    }
    if (c === "/" && d === "*") {
      emBloco = true;
      saida += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      emString = c;
      saida += c;
      i += 1;
      continue;
    }
    saida += c;
    i += 1;
  }
  return saida;
}

/** Índice do `)` que fecha o `(` em `abre`, contando parênteses/colchetes/chaves e strings. */
function fimDoBloco(texto, abre) {
  let profundidade = 0;
  let i = abre;
  let emString = null;
  let escapado = false;
  while (i < texto.length) {
    const c = texto[i];
    if (emString) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === emString) emString = null;
    } else if (c === '"' || c === "'" || c === "`") {
      emString = c;
    } else if (c === "(" || c === "[" || c === "{") {
      profundidade += 1;
    } else if (c === ")" || c === "]" || c === "}") {
      profundidade -= 1;
      if (profundidade === 0) return i;
    }
    i += 1;
  }
  return texto.length;
}

/** Separa os argumentos de nível raiz da chamada (vírgula fora de parênteses/colchetes/chaves). */
function separarArgumentos(bloco) {
  const partes = [];
  let atual = "";
  let profundidade = 0;
  let emString = null;
  let escapado = false;
  for (const c of bloco) {
    if (emString) {
      atual += c;
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === emString) emString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      emString = c;
      atual += c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profundidade += 1;
    else if (c === ")" || c === "]" || c === "}") profundidade -= 1;
    if (c === "," && profundidade === 0) {
      partes.push(atual);
      atual = "";
      continue;
    }
    atual += c;
  }
  partes.push(atual);
  return partes;
}

/**
 * Achados em respostas montadas à mão (`new Response`) ou via `jsonResponse`.
 * A ordem dos argumentos e o número de linhas não importam: `status` pode vir
 * depois do corpo (searchbox-budget-alert) ou na linha seguinte
 * (webhook-diagnostic). Chamadas sanitizantes (`internalErrorResponse`) não
 * entram aqui; no `jsonResponse`, o único corpo aceito num 5xx é a chamada a um
 * construtor de envelope documentado (ENVELOPES_DOCUMENTADOS).
 */
function exposicoesEmRespostasManuais(limpo) {
  const achados = [];
  const linhas = limpo.split("\n");
  const jaVistos = new Set();
  for (const chamada of limpo.matchAll(RESPOSTAS_MANUAIS)) {
    const abre = limpo.indexOf("(", chamada.index);
    const fecha = fimDoBloco(limpo, abre);
    const linha = limpo.slice(0, chamada.index).split("\n").length;
    const textoLinha = (linhas[linha - 1] ?? "").trim();
    // Convenção do repo (e dos testes): linha de continuação de comentário não é código.
    if (textoLinha.startsWith("*")) continue;
    const args = separarArgumentos(limpo.slice(abre + 1, fecha));
    const corpo = args[0] ?? "";
    // `jsonResponse(corpo, status, req)`: o status é o segundo argumento e o corpo
    // vindo de construtor de envelope documentado é a única exceção. No
    // `new Response` o status está no inicializador (`{ status: 5xx }`).
    const ehJsonResponse = chamada[0].startsWith("jsonResponse");
    if (ehJsonResponse && ENVELOPES_DOCUMENTADOS.test(corpo)) continue;
    const cincoXX = ehJsonResponse
      ? /^\s*5\d\d\b/u.test(args[1] ?? "")
      : /status\s*:\s*5\d\d\b/u.test(args.slice(1).join(","));
    const vazaStack = /\.stack\b/u.test(corpo);
    const vazaMensagem = /\.message\b/u.test(corpo);
    const padrao = vazaStack
      ? ".stack na resposta HTTP"
      : cincoXX && vazaMensagem
        ? ".message em resposta 5xx"
        : null;
    if (!padrao) continue;
    const chave = `${linha}|${padrao}`;
    if (jaVistos.has(chave)) continue;
    jaVistos.add(chave);
    achados.push({ arquivo: "", linha, padrao, trecho: textoLinha.slice(0, 120) });
  }
  return achados;
}

/**
 * Devolve as exposições encontradas num fonte. Função pura — sem I/O, é o contrato dos testes.
 * Linhas de comentário são ignoradas; a varredura por linha (legado) roda junto com a leitura
 * da chamada inteira (R2-INF-016), para que a ordem dos argumentos não esconda nada.
 */
export function acharExposicoes(fonte, arquivo = "arquivo.ts") {
  const achados = [];
  const limpo = limparComentarios(fonte);
  const linhas = limpo.split("\n");

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const semEspaco = linha.trim();
    if (semEspaco.startsWith("*")) continue;
    for (const { nome, re } of PADROES) {
      if (re.test(linha)) achados.push({ arquivo, linha: i + 1, padrao: nome, trecho: semEspaco.slice(0, 120) });
    }
  }

  for (const achado of exposicoesEmRespostasManuais(limpo)) {
    // A varredura por linha já apontou esta linha: não conta duas vezes o mesmo vazamento.
    if (achados.some((a) => a.linha === achado.linha)) continue;
    achados.push({ ...achado, arquivo });
  }

  achados.sort((a, b) => a.linha - b.linha);
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
  return arquivos.sort((a, b) => a.localeCompare(b));
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
