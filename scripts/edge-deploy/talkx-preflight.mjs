#!/usr/bin/env node
// X023 — Preflight de paridade de deploy das 5 edges + segredos, antes do
// primeiro disparo real (CAP-046, CAP-051).
//
// O que este script mede (e o que NÃO mede):
//   - LOCAL (sempre, sem token): recomputa o `source_sha256` e o `verify_jwt` de
//     cada função do escopo a partir do código-fonte + `supabase/config.toml` e
//     compara com o `supabase/deployment-manifest.json` commitado. Divergência
//     aqui = o manifesto está STALE (alguém editou fonte/config sem regenerar),
//     ou o `verify_jwt` driftou — o que o deploy-functions.yml reverteria.
//   - REMOTO (com SUPABASE_ACCESS_TOKEN): busca o inventário da Management API e
//     confere `verify_jwt` (paridade de configuração), status ACTIVE e bundle
//     digest válido para as 5 funções. Isto NÃO prova equivalência fonte↔bundle
//     (source_sha256 local e ezbr_sha256 remoto são objetos diferentes) — apenas
//     que a função está no ar, ativa, com a configuração de autenticação correta.
//   - SEGREDOS (com --secrets-file): confere a presença dos nomes exigidos no
//     `supabase secrets list` (nunca os valores — ver secrets-scope.mjs).
//
// Regra de operação (docs/talkx/OPERACAO.md §10): sem preflight verde do dia
// (diverged: 0 e missing: 0) não se lança campanha real.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDeploymentManifest, verifyManifestDigest } from './manifest-lib.mjs';
import { fetchRemoteInventory, CANONICAL_PROJECT } from './stable-inventory.mjs';
import { extrairNomesDeSecrets } from './secrets-scope.mjs';

/** Funções que precisam estar em paridade antes do primeiro disparo real. */
export const PREFLIGHT_FUNCTIONS = [
  'talkx-send',
  'talkx-scheduler',
  'talkx-link',
  'talkx-report',
  'evolution-webhook',
];

/** Secrets exigidos, por NOME (nunca por valor). */
export const SECRETS_EXIGIDOS = [
  'EVOLUTION_API_URL',
  'EVOLUTION_API_KEY',
  'EVOLUTION_INSTANCE_TOKEN',
  'RESEND_API_KEY',
  'TALKX_LINK_IP_SALT',
  'TALKX_LINK_BASE_URL',
];

const FORMA_SHA256 = /^[a-f0-9]{64}$/;

/**
 * Compara o manifesto commitado com o recomputado agora do código-fonte.
 * Devolve a lista de divergências (função + o que divergiu) e o detalhe por
 * função. `diverged` é o comprimento da lista — o aceite exige `diverged: 0`.
 */
export function compararParidade({ manifestoCommitado, manifestoFresco }) {
  const commitadas = new Map((manifestoCommitado?.functions ?? []).map((f) => [f.name, f]));
  const frescas = new Map((manifestoFresco?.functions ?? []).map((f) => [f.name, f]));
  const divergidas = [];
  const funcoes = [];
  for (const nome of PREFLIGHT_FUNCTIONS) {
    const commitada = commitadas.get(nome);
    const fresca = frescas.get(nome);
    if (!commitada || !fresca) {
      divergidas.push({ funcao: nome, motivo: 'ausente do manifesto (commitado ou fresco)' });
      funcoes.push({ funcao: nome, ok: false, ausente: true });
      continue;
    }
    const digestDiverge = commitada.source_sha256 !== fresca.source_sha256;
    const jwtDiverge = commitada.verify_jwt !== fresca.verify_jwt;
    const ok = !digestDiverge && !jwtDiverge;
    funcoes.push({
      funcao: nome,
      source_sha256: FORMA_SHA256.test(commitada.source_sha256 ?? '') ? commitada.source_sha256 : null,
      verify_jwt: commitada.verify_jwt,
      digest_diverge: digestDiverge,
      verify_jwt_diverge: jwtDiverge,
      ok,
    });
    if (!ok) {
      divergidas.push({ funcao: nome, digest_diverge: digestDiverge, verify_jwt_diverge: jwtDiverge });
    }
  }
  return { divergidas, diverged: divergidas.length, funcoes };
}

/**
 * Nomes exigidos ausentes do `secrets list` remoto. `nomesRemotos === null`
 * significa "não foi possível ler" (devolve null = não verificado), nunca "tudo
 * ausente". `[]` (array vazio) significa leitura ok e nada ausente.
 */
export function secretsAusentes({ nomesRemotos }) {
  if (nomesRemotos === null) return null;
  const remotos = new Set(nomesRemotos);
  return SECRETS_EXIGIDOS.filter((nome) => !remotos.has(nome)).sort();
}

/**
 * Confere as 5 funções no inventário remoto (Management API): verify_jwt igual,
 * status ACTIVE e bundle digest com a forma esperada. Devolve a lista de
 * divergências — vazia quando as 5 estão em paridade de configuração.
 */
export function paridadeRemota({ manifesto, remoto }) {
  const porNome = new Map((manifesto?.functions ?? []).map((f) => [f.name, f]));
  const remotas = new Map((remoto ?? []).map((f) => [f.slug, f]));
  const divergidas = [];
  for (const nome of PREFLIGHT_FUNCTIONS) {
    const local = porNome.get(nome);
    const remota = remotas.get(nome);
    if (!local) {
      divergidas.push({ funcao: nome, motivo: 'ausente do manifesto local' });
      continue;
    }
    if (!remota) {
      divergidas.push({ funcao: nome, motivo: 'ausente do inventário remoto' });
      continue;
    }
    if (remota.verify_jwt !== local.verify_jwt) {
      divergidas.push({ funcao: nome, motivo: `verify_jwt divergente (remoto=${remota.verify_jwt}, manifesto=${local.verify_jwt})` });
    }
    if (remota.status !== 'ACTIVE') {
      divergidas.push({ funcao: nome, motivo: `status remoto=${remota.status ?? 'desconhecido'} (esperado ACTIVE)` });
    }
    if (!FORMA_SHA256.test(remota.ezbr_sha256 ?? '')) {
      divergidas.push({ funcao: nome, motivo: 'bundle digest remoto ausente ou malformado' });
    }
  }
  return divergidas;
}

/** Query documentada que confere os segredos do motor no Vault + o comando do job. */
export const QUERY_VAULT_E_JOB = `-- Existência dos segredos do motor no Vault (nomes apenas, nunca os valores):
SELECT name, created_at
  FROM vault.secrets
 WHERE name IN ('talkx_cron_secret', 'talkx_send_url', 'talkx_scheduler_url')
 ORDER BY name;

-- Comando do job do tick (deve conter trigger_talkx_engine_tick):
SELECT jobname, schedule, active, command
  FROM cron.job
 WHERE jobname = 'talkx-scheduler-1min';`;

function dataHora(agora = new Date()) {
  return agora.toISOString().slice(0, 10);
}

export function montarEvidencia({
  projectRef, gitSha, createdAt, paridade, remotoDivergidas, secretsExigidos, secretsFaltando,
}) {
  const remotas = remotoDivergidas ?? null;
  const divergedTotal = paridade.diverged + (remotas?.length ?? 0);
  const missing = secretsFaltando === null ? null : secretsFaltando.length;
  const conclusao = divergedTotal === 0 && (missing === null || missing === 0)
    ? 'preflight verde'
    : 'divergências encontradas — disparar deploy-functions.yml / corrigir segredos antes do disparo real';
  return {
    schema_version: 1,
    project_ref: projectRef,
    git_sha: gitSha ?? null,
    created_at: createdAt,
    funcoes_preflight: PREFLIGHT_FUNCTIONS,
    local: paridade.funcoes,
    divergidas: {
      local: paridade.divergidas,
      remoto: remotas,
      total: divergedTotal,
    },
    secrets: {
      exigidos: secretsExigidos,
      ausentes: secretsFaltando,
      missing,
    },
    vault_e_job: QUERY_VAULT_E_JOB,
    conclusao,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const valor = (nome) => {
    const i = args.indexOf(nome);
    return i === -1 ? undefined : args[i + 1];
  };
  const repoRoot = valor('--repo-root') ?? process.cwd();
  const manifestoCaminho = valor('--manifest') ?? 'supabase/deployment-manifest.json';
  const segredosArquivo = valor('--secrets-file');
  const saida = valor('--output') ?? path.join(
    repoRoot, 'docs/talkx/recovery/evidence/X023', `preflight-${dataHora()}.json`,
  );
  const gitSha = valor('--git-sha');

  const manifestoCommitado = JSON.parse(await readFile(manifestoCaminho, 'utf8'));
  verifyManifestDigest(manifestoCommitado);
  if (manifestoCommitado.project_ref !== CANONICAL_PROJECT) {
    throw new Error(`Projeto não-canônico no manifesto: ${manifestoCommitado.project_ref}`);
  }

  // LOCAL: recomputa o manifesto do código-fonte + config.toml e compara.
  const manifestoFresco = await buildDeploymentManifest({ repoRoot });
  const paridade = compararParidade({ manifestoCommitado, manifestoFresco });

  // REMOTO (opcional): só com token da Management API.
  let remotoDivergidas = null;
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    const remoto = await fetchRemoteInventory({ projectRef: manifestoCommitado.project_ref, token: process.env.SUPABASE_ACCESS_TOKEN });
    remotoDivergidas = paridadeRemota({ manifesto: manifestoCommitado, remoto });
  }

  // SEGREDOS (opcional): só com o `secrets list` já coletado em arquivo.
  let nomesRemotos = null;
  if (segredosArquivo) {
    try {
      nomesRemotos = extrairNomesDeSecrets(await readFile(segredosArquivo, 'utf8'));
    } catch {
      nomesRemotos = null; // arquivo ilegível = leitura falhada, não "vazio"
    }
  }
  const secretsFaltando = secretsAusentes({ nomesRemotos });

  const evidencia = montarEvidencia({
    projectRef: manifestoCommitado.project_ref,
    gitSha,
    createdAt: new Date().toISOString(),
    paridade,
    remotoDivergidas,
    secretsExigidos: SECRETS_EXIGIDOS,
    secretsFaltando,
  });

  await mkdir(path.dirname(saida), { recursive: true });
  await writeFile(saida, `${JSON.stringify(evidencia, null, 2)}\n`, 'utf8');

  console.log(`preflight: ${evidencia.divergidas.total} divergida(s) nas 5 funções, ` +
    `${evidencia.secrets.missing === null ? 'segredos não verificados' : `${evidencia.secrets.missing} secreto(s) ausente(s)`}`);
  console.log(`evidência: ${saida}`);
  for (const d of evidencia.divergidas.local) console.log(`  DIVERGE ${d.funcao}: ${d.motivo ?? JSON.stringify(d)}`);
  if (remotoDivergidas) for (const d of remotoDivergidas) console.log(`  DIVERGE(remoto) ${d.funcao}: ${d.motivo}`);

  if (evidencia.divergidas.total > 0 || (evidencia.secrets.missing ?? 0) > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`preflight falhou: ${error?.message ?? error}`);
    process.exitCode = 1;
  });
}
