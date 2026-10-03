// X023 — O preflight precisa medir o que é mensurável e não afirmar paridade
// que ninguém mediu. O ponto delicado (igual ao deploy-plan E57): o
// `source_sha256` local e o `ezbr_sha256` remoto são objetos DIFERENTES — a
// paridade local é digest(fonte) == digest(manifesto commitado), e a remota é
// só verify_jwt/ACTIVE/digest com forma válida, nunca "bundle igual ao fonte".

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  compararParidade,
  secretsAusentes,
  paridadeRemota,
  montarEvidencia,
  PREFLIGHT_FUNCTIONS,
  SECRETS_EXIGIDOS,
  QUERY_VAULT_E_JOB,
} from './talkx-preflight.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function manifesto(functions) {
  return { functions };
}
function funcao(name, source_sha256, verify_jwt = true) {
  return { name, entrypoint: `supabase/functions/${name}/index.ts`, verify_jwt, source_sha256 };
}
function todas(source = A, jwt = true) {
  return PREFLIGHT_FUNCTIONS.map((nome) => funcao(nome, source, jwt));
}

test('X023: manifesto em paridade com o fonte → diverged: 0', () => {
  const paridade = compararParidade({
    manifestoCommitado: manifesto(todas()),
    manifestoFresco: manifesto(todas()),
  });
  assert.equal(paridade.diverged, 0);
  assert.deepEqual(paridade.divergidas, []);
  assert.ok(paridade.funcoes.every((f) => f.ok === true));
});

test('X023: digest divergente (fonte editado sem regenerar o manifesto) → diverged > 0', () => {
  const commitado = todas(A);
  const fresco = todas(B); // fonte mudou, manifesto commitado ficou stale
  const paridade = compararParidade({
    manifestoCommitado: manifesto(commitado),
    manifestoFresco: manifesto(fresco),
  });
  assert.equal(paridade.diverged, PREFLIGHT_FUNCTIONS.length);
  const send = paridade.funcoes.find((f) => f.funcao === 'talkx-send');
  assert.equal(send.digest_diverge, true);
  assert.equal(send.verify_jwt_diverge, false);
  assert.match(JSON.stringify(paridade.divergidas), /talkx-send/);
});

test('X023: verify_jwt drift (config.toml virou a exceção) é sinalizado à parte', () => {
  const commitado = todas(A, true);
  const fresco = todas(A, true).map((f) => (f.name === 'talkx-link' ? { ...f, verify_jwt: false } : f));
  const paridade = compararParidade({
    manifestoCommitado: manifesto(commitado),
    manifestoFresco: manifesto(fresco),
  });
  assert.equal(paridade.diverged, 1);
  assert.equal(paridade.funcoes.find((f) => f.funcao === 'talkx-link').verify_jwt_diverge, true);
});

test('X023: função ausente do manifesto (commitado ou fresco) conta como divergência', () => {
  const semReport = todas().filter((f) => f.name !== 'talkx-report');
  const paridade = compararParidade({
    manifestoCommitado: manifesto(todas()),
    manifestoFresco: manifesto(semReport),
  });
  assert.equal(paridade.diverged, 1);
  assert.match(JSON.stringify(paridade.divergidas), /talkx-report/);
});

test('X023: segredos — ausentes, todos presentes e leitura falhada (null)', () => {
  assert.deepEqual(secretsAusentes({ nomesRemotos: null }), null);
  assert.deepEqual(secretsAusentes({ nomesRemotos: SECRETS_EXIGIDOS }), []);
  const semDois = SECRETS_EXIGIDOS.slice(0, -2);
  const faltando = secretsAusentes({ nomesRemotos: semDois });
  assert.deepEqual(faltando, SECRETS_EXIGIDOS.slice(-2).sort());
});

test('X023: paridade remota — verify_jwt, ACTIVE e digest com forma válida', () => {
  const manifest = manifesto(todas());
  const remotoOk = PREFLIGHT_FUNCTIONS.map((nome) => ({
    slug: nome, verify_jwt: true, status: 'ACTIVE', ezbr_sha256: A,
  }));
  assert.deepEqual(paridadeRemota({ manifesto: manifest, remoto: remotoOk }), []);

  const remotoJwt = remotoOk.map((f) => (f.slug === 'talkx-link' ? { ...f, verify_jwt: false } : f));
  assert.match(JSON.stringify(paridadeRemota({ manifesto: manifest, remoto: remotoJwt })), /talkx-link/);

  const remotoInativo = remotoOk.map((f) => (f.slug === 'talkx-send' ? { ...f, status: 'INACTIVE' } : f));
  assert.match(JSON.stringify(paridadeRemota({ manifesto: manifest, remoto: remotoInativo })), /ACTIVE/);

  const remotoSemDigest = remotoOk.map((f) => (f.slug === 'talkx-send' ? { ...f, ezbr_sha256: 'curto' } : f));
  assert.match(JSON.stringify(paridadeRemota({ manifesto: manifest, remoto: remotoSemDigest })), /bundle digest/);
});

test('X023: a evidência resume diverged/missing e cita a query do Vault + job', () => {
  const paridade = compararParidade({ manifestoCommitado: manifesto(todas()), manifestoFresco: manifesto(todas(B)) });
  const evidencia = montarEvidencia({
    projectRef: 'tnnnlkbymytvtqngbbqh',
    gitSha: null,
    createdAt: '2026-10-03T00:00:00.000Z',
    paridade,
    remotoDivergidas: null,
    secretsExigidos: SECRETS_EXIGIDOS,
    secretsFaltando: null,
  });
  assert.equal(evidencia.divergidas.total, PREFLIGHT_FUNCTIONS.length);
  assert.equal(evidencia.secrets.missing, null);
  assert.match(evidencia.conclusao, /divergências encontradas/);
  assert.match(evidencia.vault_e_job, /vault\.secrets/);
  assert.match(evidencia.vault_e_job, /talkx-scheduler-1min/);
  assert.match(QUERY_VAULT_E_JOB, /talkx_cron_secret/);
});

test('X023: digest divergente → o CLI sai com código ≠ 0 (aceite)', async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'talkx-preflight-'));
  const funcs = path.join(repo, 'supabase', 'functions');
  for (const nome of PREFLIGHT_FUNCTIONS) {
    const dir = path.join(funcs, nome);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.ts'), '// stub\n');
  }
  await mkdir(path.join(repo, 'supabase'), { recursive: true });
  await writeFile(path.join(repo, 'supabase', 'config.toml'), 'project_id = "tnnnlkbymytvtqngbbqh"\n');
  // Manifesto commitado = estado atual do fonte (paridade).
  const { buildDeploymentManifest } = await import('./manifest-lib.mjs');
  const correto = await buildDeploymentManifest({ repoRoot: repo });
  const manifestoCaminho = path.join(repo, 'supabase', 'deployment-manifest.json');
  await writeFile(manifestoCaminho, `${JSON.stringify(correto, null, 2)}\n`);
  // Edita o fonte DEPOIS de gerar o manifesto: o commitado fica stale.
  await writeFile(path.join(funcs, 'talkx-send', 'index.ts'), '// stub\n// edição sem regenerar o manifesto\n');

  const saida = path.join(repo, 'out.json');
  const cli = spawnSync(process.execPath, [
    path.join(process.cwd(), 'scripts/edge-deploy/talkx-preflight.mjs'),
    '--repo-root', repo,
    '--output', saida,
  ], { encoding: 'utf8' });
  assert.notEqual(cli.status, 0, `esperava saída ≠ 0; stdout=${cli.stdout}`);
  assert.match(cli.stdout, /DIVERGE talkx-send/);
  const evidencia = JSON.parse(await readFile(saida, 'utf8'));
  assert.ok(evidencia.divergidas.total >= 1);
});
