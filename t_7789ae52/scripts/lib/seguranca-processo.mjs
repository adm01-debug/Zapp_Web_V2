/**
 * Utilidades compartilhadas pelos scripts de auditoria/CI.
 *
 * Existe para nao repetir, em cada ponto de uso, dois trechos que o Sonar
 * cobra de forma independente:
 *
 *  - `resolverExecutavel`: entrega o caminho ABSOLUTO do binario antes de criar
 *    processo filho. A regra `javascript:S4036` e puramente sintatica: dispara
 *    quando o PRIMEIRO argumento da chamada e um literal de string que nao
 *    comeca com prefixo de caminho (`/`, `./`, `..`), e NUNCA olha o `env`.
 *    Por isso passar `env: { PATH: '<fixo>' }` nao silencia o achado -- e, pior,
 *    troca o binario resolvido (aqui isso pularia o shim de guarda do ambiente,
 *    fazendo `git init` passar onde ele deve ser bloqueado).
 *
 *  - `resolverCaminhoPermitido`: recusa caminho vindo de argv/env que escape das
 *    raizes legitimas (`jssecurity:S8707`, path traversal). Fail-closed: lanca.
 *
 * Este arquivo vive em `scripts/lib/`, entao `RAIZ_REPO` e calculado a partir
 * dele mesmo (duas pastas acima).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do repositorio, derivada da posicao deste arquivo. */
export const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Raizes onde os scripts legitimamente leem/escrevem: o repositorio (snapshots
 * commitados) e os diretorios temporarios (saida fresca do psql, diretorio do
 * proxy local). Qualquer outra origem e recusada.
 */
export const RAIZES_PERMITIDAS = [RAIZ_REPO, path.resolve(os.tmpdir()), path.resolve('/tmp')];

/**
 * Caminho absoluto de `comando`, resolvido pelo PATH de quem chamou.
 *
 * Preserva exatamente o binario que o shell resolveria -- inclusive shims de
 * guarda no PATH. Lanca se nao existir: melhor falhar alto do que rodar outro
 * binario silenciosamente.
 */
export function resolverExecutavel(comando) {
  const diretorios = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const diretorio of diretorios) {
    const candidato = path.join(diretorio, comando);
    try {
      fs.accessSync(candidato, fs.constants.X_OK);
      return candidato;
    } catch {
      // Nao esta neste diretorio: segue a busca, igual ao shell.
    }
  }
  throw new Error('comando nao encontrado no PATH: ' + comando);
}

/** Verdadeiro quando `candidato` esta dentro de `raiz` (a propria raiz conta). */
export function estaDentro(raiz, candidato) {
  const relativo = path.relative(raiz, candidato);
  return relativo === ''
    || (!path.isAbsolute(relativo) && relativo !== '..' && !relativo.startsWith('..' + path.sep));
}

/**
 * Resolve o caminho recebido do chamador e exige que fique dentro de uma raiz
 * permitida. Lanca (fail-closed) quando escapa -- quem chama converte em erro
 * legivel + `process.exit` com o codigo de entrada invalida do proprio script.
 */
export function resolverCaminhoPermitido(valor, rotulo, raizes = RAIZES_PERMITIDAS) {
  const resolvido = path.resolve(valor);
  if (!raizes.some((raiz) => estaDentro(raiz, resolvido))) {
    throw new Error('caminho de ' + rotulo + ' fora das raizes permitidas (repositorio ou diretorio temporario): ' + valor);
  }
  return resolvido;
}
