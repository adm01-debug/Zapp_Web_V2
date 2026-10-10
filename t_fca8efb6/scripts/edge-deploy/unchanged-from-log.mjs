#!/usr/bin/env node
// E56 (auditoria de GitHub Actions, 2026-10-01): extrator testavel de
// "No change found in Function: X", com fixture do log real.
//
// Historia (por que as duas propriedades abaixo importam):
//
//  - run 36583351162 (2026-09-29, F-03): o CLI marca "No change found" quando o
//    bundle local bate byte a byte com o publicado e nao bumpa a versao. O
//    extrator original usava ancoras ^...$ e NAO casava a linha, porque o CLI
//    emite ANSI mesmo com `tee` -- `unchangedSet` ficava vazio e a atestacao
//    esgotava as 144 amostras (~24 min) esperando um bump que nunca viria.
//    A correcao no YAML tirou as ancoras.
//  - sem ancoras, `\S+` passou a capturar tambem o eco do proprio script
//    (`...matchAll(/No change found in Function: (\S+)/g)...`), que o runner
//    imprime com ANSI. Esse texto virava uma "funcao sem mudanca" inexistente
//    no artifact de evidencia.
//
// Este modulo preserva o que o F-03 exigia (casa a linha com ANSI, em qualquer
// posicao) e devolve o que a ancora dava (so saida do CLI vira slug): strip de
// ANSI, a frase precisa abrir a linha e o slug precisa ter forma de nome de
// funcao. As duas propriedades estao travadas por teste, com o log real.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
// A frase abre a linha; o resto tem de ser forma de slug. `\s*$` tolera \r de
// barra de progresso e espaco de alinhamento.
const LINHA = /^No change found in Function:\s+([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/;
// Nome de funcao no projeto: minusculo, digitos e hifen.
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function stripAnsi(texto) {
  return String(texto).replace(ANSI, '');
}

export function extractUnchangedSlugs(logBruto) {
  const vistos = new Set();
  const saida = [];
  for (const linha of stripAnsi(logBruto).split('\n')) {
    const m = linha.match(LINHA);
    if (!m) continue;
    const slug = m[1];
    if (!SLUG.test(slug)) continue;
    if (vistos.has(slug)) continue;
    vistos.add(slug);
    saida.push(slug);
  }
  return saida;
}

// Uso pelo workflow: node unchanged-from-log.mjs <log-do-deploy> <saida.json>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [entrada, saida] = process.argv.slice(2);
  if (!entrada || !saida) {
    console.error('Uso: node unchanged-from-log.mjs <log-do-deploy> <saida.json>');
    process.exitCode = 1;
  } else {
    const slugs = extractUnchangedSlugs(readFileSync(entrada, 'utf8'));
    writeFileSync(saida, `${JSON.stringify(slugs)}\n`);
    console.log(`Funcoes sem mudanca de bundle: ${slugs.length ? slugs.join(', ') : 'nenhuma'}`);
  }
}
