// GA14 (plano 2026-10-15): hash do LOTE para o modo apply_all_missing.
//
// A E64 amarrou (runtime, arquivo, commit) para UMA migration. No lote, cada
// versao tem seu runtime_sha256 e seu sha de arquivo; o hash do lote amarra a
// LISTA ORDENADA inteira + o commit do dry-run:
//
//   nucleo = "v1\n<runtime1>\n<arquivo1>\nv2\n<runtime2>\n<arquivo2>\n...\n"
//   hash   = sha256(nucleo + commitSha + "\n")
//
// Qualquer versao a mais, a menos, fora de ordem, com arquivo editado ou com
// runtime diferente (inclusive migration que entrou depois do dry-run — o caso
// da GA14) muda o hash e o apply recusa (janela TOCTOU fechada no apply job).
//
// Componente fora de forma e erro de programacao (lanca, como comporHashConfirmacao).

import { sha256DeTexto, comporHashConfirmacao } from './confirm-hash.mjs';

const FORMA_VERSAO = /^\d{14}$/;
const FORMA_SHA256 = /^[a-f0-9]{64}$/;

/**
 * @param {{ versions: string[], runtimeShas: string[], arquivoShas: string[], commitSha: string }} entrada
 * @returns {string} hash de confirmacao do lote
 */
export function comporHashLote({ versions, runtimeShas, arquivoShas, commitSha }) {
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('lote vazio: sem versions nao ha o que confirmar');
  }
  if (versions.length !== runtimeShas?.length || versions.length !== arquivoShas?.length) {
    throw new Error('versions, runtimeShas e arquivoShas precisam ter o mesmo tamanho');
  }
  for (const v of versions) {
    if (!FORMA_VERSAO.test(String(v ?? ''))) throw new Error(`versao fora de forma: ${v}`);
  }
  for (let i = 1; i < versions.length; i += 1) {
    if (versions[i] <= versions[i - 1]) {
      throw new Error(`lote fora de ordem estrita: ${versions[i - 1]} antes de ${versions[i]}`);
    }
  }
  for (const s of [...runtimeShas, ...arquivoShas]) {
    if (!FORMA_SHA256.test(String(s ?? ''))) throw new Error('componente sha256 fora de forma no lote');
  }
  // Reuso da E64: o par (runtime, arquivo) do lote vira os dois componentes
  // do hash de confirmacao; ordem e conjunto ficam amarrados no runtimePart.
  const runtimePart = sha256DeTexto(
    versions.map((v, i) => `${v}\n${runtimeShas[i]}`).join('\n') + '\n',
  );
  const arquivoPart = sha256DeTexto(
    versions.map((v, i) => `${v}\n${arquivoShas[i]}`).join('\n') + '\n',
  );
  return comporHashConfirmacao({ runtimeSha256: runtimePart, arquivoSha256: arquivoPart, commitSha });
}

function uso() {
  console.error('uso: node scripts/db-audit/compose-confirm-hash.mjs --versions v1,v2 --runtime-shas r1,r2 --arquivo-shas a1,a2 --commit <sha>');
}

// CLI (usado pelos jobs preflight/apply do db-migrate.yml): imprime o hash.
if (process.argv[1]?.endsWith('compose-confirm-hash.mjs')) {
  const args = process.argv.slice(2);
  const valor = (nome) => {
    const i = args.indexOf(nome);
    return i === -1 ? undefined : args[i + 1];
  };
  const versions = (valor('--versions') ?? '').split(',').filter(Boolean);
  const runtimeShas = (valor('--runtime-shas') ?? '').split(',').filter(Boolean);
  const arquivoShas = (valor('--arquivo-shas') ?? '').split(',').filter(Boolean);
  const commitSha = valor('--commit') ?? process.env.GITHUB_SHA;
  try {
    console.log(comporHashLote({ versions, runtimeShas, arquivoShas, commitSha }));
  } catch (e) {
    console.error(`::error::hash do lote recusado: ${e.message}`);
    process.exit(2);
  }
}
