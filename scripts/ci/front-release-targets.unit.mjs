import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TARGETS,
  parseArgs,
  resumoMarkdown,
  validarVersao,
  verificarAlvo,
} from '../vercel/verify-release-targets.mjs';

const SHA_V2 = 'a'.repeat(40);
const SHA_V3 = 'b'.repeat(40);
const NOW = Date.parse('2026-11-06T12:00:00Z');

function headers(target, kind) {
  const frame = target === 'v2' ? 'DENY' : 'SAMEORIGIN';
  const values = kind === 'asset'
    ? { 'cache-control': 'public, max-age=31536000, immutable' }
    : {
        'cache-control': 'no-cache, no-store, must-revalidate',
        'content-type': kind === 'version' ? 'application/json' : 'text/html',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-frame-options': frame,
      };
  if (target === 'v2' && kind !== 'asset') values['x-robots-tag'] = 'noindex, nofollow';
  return new Headers(values);
}

function response(target, kind, body, status = 200) {
  return {
    status,
    headers: headers(target, kind),
    async json() { return body; },
    async text() { return String(body ?? ''); },
  };
}

function versionV3(overrides = {}) {
  return {
    buildId: '1792146909078',
    gitSha: SHA_V3,
    releaseId: SHA_V3,
    builtAt: '2026-10-16T10:35:40.082Z',
    entry: 'assets/index-v3.js',
    entryCss: 'assets/index-v3.css',
    ...overrides,
  };
}

function fetchSaudavel(target, body) {
  return async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, TARGETS[target].url);
    if (parsed.pathname === '/version.json') return response(target, 'version', body);
    if (parsed.pathname === '/') return response(target, 'root', '<script type="module" src="/assets/index-v2.js"></script>');
    if (parsed.pathname.startsWith('/assets/')) return response(target, 'asset', 'js');
    return response(target, 'root', '', 404);
  };
}

test('CLI exige trilha explícita e reserva expected-sha para V2', () => {
  assert.deepEqual(parseArgs(['--target=v2', `--expected-sha=${SHA_V2}`, '--attempts=30', '--interval-ms=10000']), {
    target: 'v2', expectedSha: SHA_V2, attempts: 30, intervalMs: 10_000,
  });
  assert.throws(() => parseArgs(['--target=v3', `--expected-sha=${SHA_V2}`]), /somente ao alvo v2/);
  assert.throws(() => parseArgs(['--target=produção']), /v2 ou v3/);
  assert.throws(() => parseArgs(['--target=v2', '--attempts=61']), /inteiro entre 1 e 60/);
  assert.throws(() => parseArgs(['--target=v2', '--url=https:\/\/exemplo.invalid']), /argumento desconhecido/);
});

test('--expected-sha vazio é erro de uso, não "não verificar" silencioso', () => {
  assert.throws(() => parseArgs(['--target=v2', '--expected-sha=']), /--expected-sha não pode ser vazio/);
  assert.equal(parseArgs(['--target=v2']).expectedSha, null);
});

test('contrato V2 exige SHA completo e igualdade com a main esperada', () => {
  assert.equal(validarVersao('v2', { buildId: SHA_V2 }, { expectedSha: SHA_V2 }).release, SHA_V2);
  assert.throws(() => validarVersao('v2', { buildId: 'curto' }), /buildId inválido/);
  assert.throws(() => validarVersao('v2', { buildId: SHA_V3 }, { expectedSha: SHA_V2 }), /ainda em/);
});

test('contrato V3 exige identidade única, data com fuso e assets seguros', () => {
  const result = validarVersao('v3', versionV3(), { now: NOW });
  assert.equal(result.release, SHA_V3);
  assert.equal(result.entry, 'assets/index-v3.js');
  assert.throws(() => validarVersao('v3', versionV3({ releaseId: SHA_V2 }), { now: NOW }), /divergem/);
  assert.throws(() => validarVersao('v3', versionV3({ builtAt: '2026-10-16T10:35:40' }), { now: NOW }), /sem fuso/);
  assert.throws(() => validarVersao('v3', versionV3({ builtAt: '2027-01-01T00:00:00Z' }), { now: NOW }), /futuro/);
  assert.throws(() => validarVersao('v3', versionV3({ entry: '../segredo.js' }), { now: NOW }), /entry inválido/);
});

test('trilha V2 valida versão, SPA, headers e cache imutável do asset', async () => {
  const result = await verificarAlvo({
    target: 'v2', expectedSha: SHA_V2, fetchImpl: fetchSaudavel('v2', { buildId: SHA_V2 }), nowImpl: () => NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.release, SHA_V2);
  assert.equal(result.entry, 'assets/index-v2.js');
});

test('trilha V2 espera propagação e só aprova quando chega ao SHA esperado', async () => {
  let versions = 0;
  let sleeps = 0;
  const healthy = fetchSaudavel('v2', { buildId: SHA_V2 });
  const fetchImpl = async (url, options) => {
    if (new URL(url).pathname === '/version.json' && versions++ === 0) {
      return response('v2', 'version', { buildId: SHA_V3 });
    }
    return healthy(url, options);
  };
  const result = await verificarAlvo({
    target: 'v2', expectedSha: SHA_V2, attempts: 2, intervalMs: 10,
    fetchImpl, sleepImpl: async (ms) => { assert.equal(ms, 10); sleeps += 1; }, nowImpl: () => NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempt, 2);
  assert.equal(sleeps, 1);
});

test('trilha V3 aceita release própria e não exige o header noindex da V2', async () => {
  const assets = [];
  const healthy = fetchSaudavel('v3', versionV3());
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    if (path.startsWith('/assets/')) assets.push(path);
    return healthy(url, options);
  };
  const result = await verificarAlvo({ target: 'v3', fetchImpl, nowImpl: () => NOW });
  assert.equal(result.ok, true);
  assert.equal(result.release, SHA_V3);
  assert.equal(result.builtAt, '2026-10-16T10:35:40.082Z');
  assert.deepEqual(assets, ['/assets/index-v3.js', '/assets/index-v3.css']);
});

test('falha de cache/header fica na trilha correta e produz resumo acionável', async () => {
  const fetchImpl = async () => ({
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    async json() { return { buildId: SHA_V2 }; },
  });
  const result = await verificarAlvo({ target: 'v2', expectedSha: SHA_V2, fetchImpl, nowImpl: () => NOW });
  assert.equal(result.ok, false);
  assert.match(result.error, /cache-control/);
  assert.match(resumoMarkdown(result), /V2 · alias Vercel[\s\S]*FALHOU/);
});

test('workflow mantém V2 e V3 em jobs separados e só compara a main com V2', () => {
  const workflow = readFileSync('.github/workflows/front-release-targets.yml', 'utf8');
  assert.match(workflow, /^name: Front release targets \(V2\/V3\)$/mu);
  assert.match(workflow, /^  v2-alias:/mu);
  assert.match(workflow, /^  v3-domain:/mu);
  assert.match(workflow, /--target=v2[\s\S]*--expected-sha="\$\{GITHUB_SHA\}"/u);
  const v3 = workflow.slice(workflow.indexOf('  v3-domain:'));
  assert.match(v3, /--target=v3/u);
  assert.doesNotMatch(v3, /--expected-sha/u);
  assert.match(workflow, /cron: '17 \* \* \* \*'/u);
  assert.match(workflow, /persist-credentials: false/u);
});

test('falha do monitor abre issue e a documentação não confunde V3 com deploy V2', () => {
  const notify = readFileSync('.github/workflows/notifica-falha-main.yml', 'utf8');
  const claude = readFileSync('docs/agentes/vercel-deploy.md', 'utf8'); // CLAUDE.md e so `@AGENTS.md`
  const runbook = readFileSync('docs/runbooks/deploy.md', 'utf8');
  const readme = readFileSync('scripts/vercel/README.md', 'utf8');
  assert.match(notify, /- Front release targets \(V2\/V3\)/u);
  assert.match(claude, /zappweb\.app\.br` serve a \*\*V3\*\*/u);
  assert.match(runbook, /domínio deve publicar uma identidade V3 coerente/u);
  assert.match(readme, /O job V3 valida a identidade publicada sem compará-la com o SHA deste repositório V2/u);
});
