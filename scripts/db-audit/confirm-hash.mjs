// E64 (auditoria de GitHub Actions, 2026-10-01) -- defeito F-11, ja documentado:
// "confirm_runtime_sha256 nao amarra o arquivo" (PLANO_..._2026-09-27.md:196 e
// REVISAO_..._2026-09-28.md:208, "E51: SHA do arquivo alvo nao incluido").
//
// O defeito: a confirmacao cobria APENAS `runtime_sha256`, o estado do schema
// lido do banco. Se alguem editasse o .sql entre o dry-run e o apply -- e nada
// no banco tivesse mudado -- a confirmacao passava e o apply executava um
// arquivo que ninguem revisou. O hash nao amarrava o conteudo.
//
// Correcao: a confirmacao passa a ser o SHA-256 de tres componentes:
//   runtime_sha256 (estado do schema) + sha256(arquivo .sql) + github.sha
// O dry-run imprime os tres e o hash final; o apply recalcula e recusa se
// qualquer um dos tres mudou.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** SHA-256 hex lowercase de um texto. */
export function sha256DeTexto(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/** SHA-256 hex lowercase do conteudo de um arquivo. */
export function sha256DeArquivo(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

// runtime e arquivo sao SHA-256 (64 hex); o commit do GitHub e SHA-1 (40 hex),
// com espaco para o dia em que o GitHub migrar para 64.
const FORMA_SHA256 = /^[a-f0-9]{64}$/;
const FORMA_COMMIT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

/**
 * Hash de confirmacao do apply: amarra estado do banco, conteudo do arquivo e
 * commit do dry-run. Componente fora de forma e' erro de programacao, nao
 * "mismatch" -- por isso lanca, em vez de devolver um booleano.
 */
export function comporHashConfirmacao({ runtimeSha256, arquivoSha256, commitSha }) {
  if (!FORMA_SHA256.test(String(runtimeSha256 ?? ''))) {
    throw new Error('componente runtimeSha256 nao e SHA-256 lowercase de 64 hex');
  }
  if (!FORMA_SHA256.test(String(arquivoSha256 ?? ''))) {
    throw new Error('componente arquivoSha256 nao e SHA-256 lowercase de 64 hex');
  }
  if (!FORMA_COMMIT.test(String(commitSha ?? ''))) {
    throw new Error('componente commitSha nao e SHA de commit do GitHub');
  }
  // Hex de tamanho fixo com separador de linha: nao ha concatenacao ambigua.
  return sha256DeTexto(`${runtimeSha256}\n${arquivoSha256}\n${commitSha}\n`);
}

/**
 * Componentes + hash final, no formato que o dry-run imprime para o operador
 * copiar no campo `confirm_runtime_sha256` do apply.
 */
export function descreverConfirmacao({ runtimeSha256, arquivoSha256, commitSha, arquivo }) {
  const hash = comporHashConfirmacao({ runtimeSha256, arquivoSha256, commitSha });
  return [
    'confirm_runtime_sha256=' + hash,
    '  runtime_sha256=' + runtimeSha256 + '   (estado do schema)',
    '  arquivo_sha256=' + arquivoSha256 + '   (' + arquivo + ')',
    '  commit_sha=' + commitSha + '   (github.sha do dry-run)',
  ].join('\n');
}
