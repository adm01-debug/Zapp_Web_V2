// E57 (auditoria de GitHub Actions, 2026-10-01): o workflow nao tem modo de
// ensaio. Um dispatch ou publica, ou nao faz nada -- nao existe "mostre o que
// seria publicado". Esta etapa acrescenta `dry_run: boolean`: tudo roda ate' o
// passo "Deploy" exclusive (inclusive o inventario remoto de antes), o plano e'
// publicado, e nenhuma escrita acontece.
//
// O que o plano mostra, por funcao do escopo:
//   - source_sha256 do manifesto (o que ESTE commit publicaria);
//   - ezbr_sha256 e version que estao NO AR (do snapshot remoto).
//
// Os dois digests NAO sao comparados, de proposito: um e' hash do codigo-fonte
// empacotado pelo repositorio, o outro e' o digest do bundle que o Supabase
// publicou. Sao objetos diferentes -- declarar "inalterada" a partir deles seria
// afirmar uma igualdade que ninguem mediu. O plano mostra os dois lados e o
// estado mensuravel (existe ou nao existe no ar).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const FORMA_SHA256 = /^[a-f0-9]{64}$/;

/** Linhas do plano, ordenadas por nome, com o escopo aplicado. */
export function montarPlano({ manifesto, remoto, escopo = '' } = {}) {
  const alvo = String(escopo ?? '').trim();
  const locais = (manifesto?.functions ?? [])
    .filter((f) => typeof f?.name === 'string')
    .filter((f) => alvo === '' || f.name === alvo);
  const remotas = new Map((remoto?.functions ?? []).filter((f) => typeof f?.slug === 'string').map((f) => [f.slug, f]));
  const linhas = locais.map((f) => {
    const noAr = remotas.get(f.name) ?? null;
    return {
      funcao: f.name,
      source_sha256: FORMA_SHA256.test(f.source_sha256 ?? '') ? f.source_sha256 : null,
      ezbr_sha256_no_ar: noAr && FORMA_SHA256.test(noAr.ezbr_sha256 ?? '') ? noAr.ezbr_sha256 : null,
      versao_no_ar: noAr && Number.isInteger(noAr.version) && noAr.version > 0 ? noAr.version : null,
      situacao: noAr === null ? 'nova (nao existe no ar)' : 'existente (publicaria por cima)',
    };
  });
  linhas.sort((a, b) => a.funcao.localeCompare(b.funcao));
  return {
    escopo: alvo === '' ? '(total)' : alvo,
    total: linhas.length,
    novas: linhas.filter((l) => l.situacao.startsWith('nova')).length,
    linhas,
  };
}

/**
 * Digest do plano: sha256 da serializacao canonica das linhas. Serve para o
 * operador comparar o plano que ele aprovou com o que o apply publicou. Independe
 * da ordem de entrada (as linhas sao ordenadas) e do `observed_at` do snapshot.
 */
export function digestDoPlano(plano) {
  const canonico = JSON.stringify({
    escopo: plano.escopo,
    linhas: plano.linhas.map((l) => [l.funcao, l.source_sha256, l.ezbr_sha256_no_ar, l.versao_no_ar]),
  });
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

export function resumoDoPlano(plano) {
  const cabecalho = `plano do deploy: escopo=${plano.escopo} funcoes=${plano.total} novas=${plano.novas}`;
  const corpo = plano.linhas.map((l) => (
    `  - ${l.funcao}: local=${(l.source_sha256 ?? 'ausente').slice(0, 12)} `
    + `no-ar=${(l.ezbr_sha256_no_ar ?? 'ausente').slice(0, 12)} versao=${l.versao_no_ar ?? '-'} (${l.situacao})`
  ));
  return [cabecalho, ...corpo, `plano_sha256=${digestDoPlano(plano)}`].join('\n');
}

// --- CLI (usado pelo passo do workflow) ------------------------------------
if (process.argv[1]?.endsWith('deploy-plan.mjs')) {
  const args = process.argv.slice(2);
  const valor = (nome) => {
    const i = args.indexOf(nome);
    return i === -1 ? undefined : args[i + 1];
  };
  const manifestoCaminho = valor('--manifest');
  const remotoCaminho = valor('--remoto');
  const saida = valor('--saida');
  if (!manifestoCaminho || !remotoCaminho) {
    console.error('uso: node scripts/edge-deploy/deploy-plan.mjs --manifest <json> --remoto <snapshot.json> [--escopo <funcao>] [--saida <arquivo>]');
    process.exit(2);
  }
  const plano = montarPlano({
    manifesto: JSON.parse(readFileSync(manifestoCaminho, 'utf8')),
    remoto: JSON.parse(readFileSync(remotoCaminho, 'utf8')),
    escopo: valor('--escopo') ?? '',
  });
  if (plano.total === 0) {
    console.error(`::error::O escopo informado nao corresponde a nenhuma funcao do manifesto (escopo=${plano.escopo}).`);
    process.exit(1);
  }
  if (saida) writeFileSync(saida, `${JSON.stringify({ ...plano, plano_sha256: digestDoPlano(plano) }, null, 2)}\n`, { mode: 0o600 });
  console.log(resumoDoPlano(plano));
}
