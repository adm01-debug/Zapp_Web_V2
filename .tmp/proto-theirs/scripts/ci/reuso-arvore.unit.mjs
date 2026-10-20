import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirReuso, JOB_REUSO, limparParaLog, urlDaApi, WORKFLOWS_COM_REUSO } from './reuso-arvore.mjs';

const REPO = 'adm01-debug/Zapp_Web_V2';
const SHA = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

function apiFalsa(over = {}) {
  const dados = {
    [`/repos/${REPO}/commits/${SHA}/pulls`]: [{ number: 10, merged_at: '2026-10-15', merge_commit_sha: SHA, base: { ref: 'main' }, head: { sha: HEAD } }],
    [`/repos/${REPO}/git/commits/${SHA}`]: { tree: { sha: 'arvore-x' } },
    [`/repos/${REPO}/git/commits/${HEAD}`]: { tree: { sha: 'arvore-x' } },
    [`/repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=20`]: {
      workflow_runs: [
        { id: 1, run_number: 5, run_attempt: 1, status: 'completed', conclusion: 'failure' },
        { id: 2, run_number: 6, run_attempt: 1, status: 'completed', conclusion: 'success' },
      ],
    },
    [`/repos/${REPO}/actions/runs/2/jobs?filter=latest&per_page=100`]: {
      // Formato real de um run de PR: o job de reuso sempre `skipped` (só roda em push).
      jobs: [
        { name: '♻️ Reuso de árvore já testada', conclusion: 'skipped' },
        { name: '🧪 Unit Tests', conclusion: 'success' },
        { name: '🧬 Mutação do mapa (não bloqueante)', conclusion: 'failure' },
      ],
    },
    ...over,
  };
  return async (caminho) => {
    if (!(caminho in dados)) throw new Error(`rota inesperada ${caminho}`);
    const v = dados[caminho];
    if (v instanceof Error) throw v;
    return v;
  };
}

const base = { evento: 'push', sha: SHA, repo: REPO, workflow: 'ci.yml' };

test('reusa: árvore igual ao head da PR e último run com todos os jobs bloqueantes verdes', async () => {
  const d = await decidirReuso({ ...base, api: apiFalsa() });
  assert.equal(d.reusar, true, d.motivo);
  assert.match(d.motivo, /run 2/);
});

test('PR e qualquer evento que não seja push rodam tudo', async () => {
  for (const evento of ['pull_request', 'workflow_dispatch', 'merge_group', 'schedule']) {
    const d = await decidirReuso({ ...base, evento, api: apiFalsa() });
    assert.equal(d.reusar, false, evento);
  }
});

test('push sem PR mergeada (ou de outra base) roda tudo', async () => {
  const semPr = await decidirReuso({ ...base, api: apiFalsa({ [`/repos/${REPO}/commits/${SHA}/pulls`]: [] }) });
  assert.equal(semPr.reusar, false);
  const outraBase = await decidirReuso({
    ...base,
    api: apiFalsa({ [`/repos/${REPO}/commits/${SHA}/pulls`]: [{ number: 10, merged_at: 'x', merge_commit_sha: SHA, base: { ref: 'dev' }, head: { sha: HEAD } }] }),
  });
  assert.equal(outraBase.reusar, false);
});

test('árvore diferente (PR não estava atualizada) roda tudo', async () => {
  const d = await decidirReuso({ ...base, api: apiFalsa({ [`/repos/${REPO}/git/commits/${HEAD}`]: { tree: { sha: 'arvore-y' } } }) });
  assert.equal(d.reusar, false);
  assert.match(d.motivo, /difere/);
});

test('último run vermelho, em andamento ou inexistente roda tudo', async () => {
  const rota = `/repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=20`;
  for (const runs of [
    [{ id: 3, run_number: 7, run_attempt: 1, status: 'completed', conclusion: 'failure' }],
    [{ id: 3, run_number: 7, run_attempt: 1, status: 'in_progress', conclusion: null }],
    [],
  ]) {
    const d = await decidirReuso({ ...base, api: apiFalsa({ [rota]: { workflow_runs: runs } }) });
    assert.equal(d.reusar, false, JSON.stringify(runs));
  }
});

test('o run mais recente decide, mesmo se um antigo foi verde', async () => {
  const rota = `/repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${HEAD}&event=pull_request&per_page=20`;
  const d = await decidirReuso({
    ...base,
    api: apiFalsa({ [rota]: { workflow_runs: [
      { id: 2, run_number: 6, run_attempt: 1, status: 'completed', conclusion: 'success' },
      { id: 9, run_number: 6, run_attempt: 2, status: 'completed', conclusion: 'failure' },
    ] } }),
  });
  assert.equal(d.reusar, false);
});

test('job bloqueante pulado (ex.: PR em draft) não conta como aprovado', async () => {
  const d = await decidirReuso({
    ...base,
    api: apiFalsa({ [`/repos/${REPO}/actions/runs/2/jobs?filter=latest&per_page=100`]: { jobs: [
      { name: '🧪 Unit Tests', conclusion: 'skipped' },
    ] } }),
  });
  assert.equal(d.reusar, false);
  assert.match(d.motivo, /Unit Tests=skipped/);
});

test('erro de API propaga para o chamador, que cai em "roda tudo"', async () => {
  await assert.rejects(decidirReuso({ ...base, api: apiFalsa({ [`/repos/${REPO}/commits/${SHA}/pulls`]: new Error('HTTP 502') }) }));
});

test('o job de reuso pulado no run da PR não impede o reuso; outro job pulado impede', async () => {
  assert.equal(JOB_REUSO, '♻️ Reuso de árvore já testada');
  const rota = `/repos/${REPO}/actions/runs/2/jobs?filter=latest&per_page=100`;
  const so = await decidirReuso({ ...base, api: apiFalsa({ [rota]: { jobs: [
    { name: JOB_REUSO, conclusion: 'skipped' },
    { name: '🏗️ Build', conclusion: 'success' },
  ] } }) });
  assert.equal(so.reusar, true, so.motivo);
  const outro = await decidirReuso({ ...base, api: apiFalsa({ [rota]: { jobs: [
    { name: JOB_REUSO, conclusion: 'skipped' },
    { name: '🏗️ Build', conclusion: 'skipped' },
  ] } }) });
  assert.equal(outro.reusar, false);
});

test('entradas com formato inválido são recusadas antes de virar URL de API', async () => {
  const api = apiFalsa();
  await assert.rejects(decidirReuso({ ...base, repo: 'x/../../evil', api }), /GITHUB_REPOSITORY/);
  await assert.rejects(decidirReuso({ ...base, sha: 'main', api }), /GITHUB_SHA/);
  await assert.rejects(decidirReuso({ ...base, workflow: '../ci.yml?x=1', api }), /--workflow/);
  await assert.rejects(decidirReuso({ ...base, workflow: 'deploy-functions.yml', api }), /--workflow/);
});

test('head da PR com SHA inválido não é consultado', async () => {
  const d = await decidirReuso({
    ...base,
    api: apiFalsa({ [`/repos/${REPO}/commits/${SHA}/pulls`]: [{ number: 10, merged_at: 'x', merge_commit_sha: SHA, base: { ref: 'main' }, head: { sha: '../x' } }] }),
  });
  assert.equal(d.reusar, false);
});

test('texto de log perde quebras de linha e caracteres de controle', () => {
  assert.equal(limparParaLog('ok\n::error::forjado\r\x1b[31m'), 'ok ::error::forjado [31m');
});

test('a URL da API fica presa à origem api.github.com e ao prefixo /repos', () => {
  assert.equal(urlDaApi('/repos/o/r/commits/x/pulls').href, 'https://api.github.com/repos/o/r/commits/x/pulls');
  assert.throws(() => urlDaApi('//evil.example/repos/x'));
  assert.throws(() => urlDaApi('https://evil.example/repos/x'));
  assert.throws(() => urlDaApi('/user'));
  assert.deepEqual(WORKFLOWS_COM_REUSO, ['ci.yml', 'db-guard.yml']);
});
