#!/usr/bin/env node
// E83: dedupe do alerta da suite logada, no mesmo mecanismo da E44 (db-live-guard.yml):
// um marcador HTML invisivel identifica a causa, e o alerta so e' repetido quando a
// causa MUDA -- nunca a cada execucao.
//
// Aqui a causa e' o conjunto de testes que falharam. O Playwright escreve um diretorio em
// `test-results/` por teste que falhou, e o nome do diretorio carrega o spec e o titulo.
//
// DECISAO DO EXECUTOR: o marcador e' o sha256 dos NOMES de diretorio (ordenados e unicos),
// sem tentar extrair o arquivo `.spec.ts` do nome. O nome do diretorio e' sanitizado pelo
// Playwright (hifens no lugar de espacos e barras) e o parse de volta seria heuristica que
// erra em titulo com hifen. O efeito pratico e' o mesmo: cada diretorio e' um teste que
// falhou, entao o dedupe continua sendo por spec/teste, e o corpo da issue lista os nomes
// crus -- legivel para quem le e sem inventar estrutura que o dado nao tem.

import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Marcador invisivel que identifica a causa (mesma ideia de `<!-- causa:<sha> -->`). */
export const PREFIXO = '<!-- e2e-logado-specs:';

/** Diretorios de `test-results/`, ordenados e sem repeticao. Arquivos soltos ficam fora. */
export function nomesDeTestResults(dir) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // sem test-results nao ha falha identificada -- ver o aviso em marcadorDe
  }
  return entradas
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Nomes validos: string, nao vazia, sem repeticao, ordenados. */
function normalizar(nomes) {
  return [...new Set((nomes ?? []).filter((n) => typeof n === 'string' && n.length > 0))].sort();
}

/**
 * Marcador da causa. Conjunto vazio gera um marcador proprio (`sem-diretorios`), e nao
 * string vazia: sem isso, uma falha que nao deixou test-results (erro no setup, por
 * exemplo) seria confundida com "mesma causa" de um alerta anterior. Entrada que nao e
 * string conta como ausente -- nao como uma causa diferente.
 */
export function marcadorDe(nomes) {
  const lista = normalizar(nomes);
  const semente = lista.length === 0 ? 'sem-diretorios' : lista.join('\n');
  const hash = createHash('sha256').update(semente).digest('hex').slice(0, 16);
  return `${PREFIXO}${hash} -->`;
}

/** Lista legivel para o corpo da issue. */
export function corpoDe(nomes) {
  const lista = normalizar(nomes);
  if (lista.length === 0) {
    return 'A suite logada falhou **sem deixar `test-results/`** -- o erro aconteceu antes do ' +
      'Playwright (setup, instalacao ou o proprio passo de login). Veja o log do run.';
  }
  return [
    `A suite logada falhou com **${lista.length}** teste(s) quebrado(s):`,
    '',
    ...lista.map((n) => `- \`${n}\``),
    '',
    '_Alerta do `e2e-logado.yml`. Fecha sozinho quando a suite voltar a passar na main._',
  ].join('\n');
}
