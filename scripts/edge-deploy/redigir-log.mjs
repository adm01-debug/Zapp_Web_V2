#!/usr/bin/env node
// E74: o `deploy-output.log` vai para o artifact do GitHub. A saida do CLI carrega
// URL com `access_token=` embutido -- publicar isso e' publicar credencial num
// storage de terceiro. Este modulo reescreve o arquivo removendo o valor do segredo
// e a propria chave antes do upload.
//
// O valor NUNCA entra no codigo nem na saida: vem do ambiente pelo nome da variavel
// (--segredo-env=SUPABASE_ACCESS_TOKEN). O que este modulo imprime e' so' a contagem.
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

const CHAVE_ALVO = /access[_%-]?token/gi;

export function redigir(texto, segredos = []) {
  let saida = texto;
  // 1. o valor literal, quando conhecido: e' a remocao que de fato protege.
  for (const valor of segredos) {
    const v = String(valor ?? '').trim();
    if (v.length < 8) continue; // valor curto demais nao e' token; evita trocar texto comum
    saida = saida.split(v).join('***');
  }
  // 2. a chave, com o que sobrou de valor a' direita (`access_token=abc`, `&access_token: x`).
  saida = saida.replace(new RegExp(`${CHAVE_ALVO.source}([=:])([^\\s"'&\\\\]*)`, 'gi'), 'token$1***');
  // 3. o nome da chave sem valor (ex.: "campo access_token ausente").
  saida = saida.replace(CHAVE_ALVO, (m) => (m === 'token' ? m : 'token'));
  return saida;
}

/**
 * S8707: confina o caminho de escrita ao diretorio-base autorizado.
 *
 * O caminho chega por argumento de CLI e o modulo ESCREVE nele. Sem confinamento, `..`
 * ou um caminho absoluto fora da base fazem o script sobrescrever arquivo arbitrario.
 * O uso legitimo e' um so' (deploy-functions.yml:491): caminho absoluto sob $RUNNER_TEMP.
 * A base vem de REDIGIR_LOG_BASE, com RUNNER_TEMP como padrao no CI.
 */
export function confinar(arquivo, base) {
  const raiz = resolve(base);
  const alvo = resolve(arquivo);
  const rel = relative(raiz, alvo);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`caminho fora da base permitida (${raiz}): ${arquivo}`);
  }
  // symlink: o alvo REAL tambem precisa estar dentro da base
  const raizReal = existsSync(raiz) ? realpathSync(raiz) : raiz;
  const alvoReal = existsSync(alvo) ? realpathSync(alvo) : alvo;
  const relReal = relative(raizReal, alvoReal);
  if (relReal === '' || relReal.startsWith('..') || isAbsolute(relReal)) {
    throw new Error(`caminho resolve para fora da base via link (${raizReal}): ${arquivo}`);
  }
  return alvo;
}

/** Base autorizada: explicita no CI, com RUNNER_TEMP como padrao do runner. */
function baseAutorizada() {
  return process.env.REDIGIR_LOG_BASE || process.env.RUNNER_TEMP || process.cwd();
}

function principal(argv) {
  const arquivo = argv[2];
  const nomes = argv.slice(3).filter((a) => a.startsWith('--segredo-env=')).map((a) => a.split('=')[1]);
  if (!arquivo) {
    console.error('::error::log de deploy nao informado');
    process.exit(2);
  }
  let caminho;
  try {
    caminho = confinar(arquivo, baseAutorizada());
  } catch (erro) {
    console.error(`::error::${erro.message}`);
    process.exit(2);
  }
  if (!existsSync(caminho)) {
    console.error(`::error::log de deploy nao encontrado: ${caminho}`);
    process.exit(2);
  }
  const original = readFileSync(caminho, 'utf8');
  const segredos = nomes.map((n) => process.env[n]).filter(Boolean);
  const limpo = redigir(original, segredos);
  const removidos = (original.match(CHAVE_ALVO) || []).length;
  writeFileSync(caminho, limpo);
  console.log(`log redigido: ${removidos} ocorrencia(s) de chave de token, ${segredos.length} valor(es) literal(is) removido(s)`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) principal(process.argv);
