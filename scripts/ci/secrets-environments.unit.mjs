// W12/W62/W63 (plano de Actions de 14/10/2026): cada segredo privilegiado e lido por
// jobs que declaram o environment certo. Isto e o que torna a migracao dos valores
// (runbook docs/runbooks/migracao-segredos-environments.md) segura de fazer aos poucos:
//
//   - job com `environment: X` le `secrets.NOME` do environment X quando ele existe la,
//     e do nivel repo quando nao existe. Declarar o environment ANTES de mover o valor
//     nao quebra nada; mover o valor DEPOIS so restringe quem o enxerga.
//   - se um job consumidor perder o `environment:` (ou um consumidor novo nascer sem ele),
//     o passo "apagar do repo" do runbook passa a quebrar esse job em silencio — o secret
//     simplesmente chega vazio. Este teste falha antes disso.
//
// Texto cru, sem parser YAML (mesmo estilo de workflow-contracts.unit.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { hasPullRequestTrigger } from './check-pr-workflow-secrets.mjs';

const DIR = new URL('../../.github/workflows/', import.meta.url);
const arquivos = (await readdir(DIR)).filter((f) => f.endsWith('.yml'));
const wf = {};
for (const f of arquivos) wf[f] = await readFile(new URL(f, DIR), 'utf8');

const baseline = JSON.parse(
  await readFile(new URL('./github-settings-baseline.json', import.meta.url), 'utf8'),
);

/** Jobs de um workflow: { nome, environment, texto } (texto = corpo do job, sem comentarios). */
function jobs(texto) {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex((l) => /^jobs:\s*(?:#.*)?$/.test(l));
  if (inicio === -1) return [];
  const saida = [];
  let atual = null;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (/^\S/.test(linha)) break; // outra chave de topo
    const cabecalho = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/.exec(linha);
    if (cabecalho) {
      atual = { nome: cabecalho[1], environment: null, linhas: [] };
      saida.push(atual);
      continue;
    }
    if (!atual) continue;
    if (/^\s*#/.test(linha)) continue;
    atual.linhas.push(linha);
    const envInline = /^ {4}environment:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/.exec(linha);
    if (envInline) atual.environment = envInline[1];
    if (/^ {4}environment:\s*(?:#.*)?$/.test(linha)) {
      // forma longa: environment:\n      name: X
      for (let j = i + 1; j < linhas.length && /^ {6}/.test(linhas[j]); j += 1) {
        const nome = /^ {6}name:\s*['"]?([^'"\s#]+)['"]?/.exec(linhas[j]);
        if (nome) atual.environment = nome[1];
      }
    }
  }
  return saida.map((j) => ({ nome: j.nome, environment: j.environment, texto: j.linhas.join('\n') }));
}

/** Todos os jobs (arquivo, job, environment) que referenciam `secrets.<nome>`. */
function consumidores(nomeSecret) {
  const re = new RegExp(`\\bsecrets\\.${nomeSecret}\\b`);
  const saida = [];
  for (const [arquivo, texto] of Object.entries(wf)) {
    for (const job of jobs(texto)) {
      if (re.test(job.texto)) saida.push({ arquivo, job: job.nome, environment: job.environment });
    }
  }
  return saida.sort((a, b) => `${a.arquivo}:${a.job}`.localeCompare(`${b.arquivo}:${b.job}`));
}

// W63: DESTINO_URL (URL de escrita do banco de producao). O mapa e fechado: consumidor
// novo precisa entrar aqui E ganhar o secret no environment dele (runbook, passo W63).
// O supabase-sync.yml foi removido em 15/10 e deixou de consumir.
const DESTINO_URL_POR_JOB = {
  'db-live-guard.yml:live-contract': 'banco-leitura',
  'db-migrate.yml:migrate': null, // GA13: environment dinamico (${{ inputs.apply }}); parser estatico devolve null
  'targeted-ledger-evidence.yml:export-encrypted-evidence': 'db-ledger-evidence',
  'types-sync.yml:sync': 'banco-leitura',
};

// W62: segredos de deploy. Todos vivem (ou vao viver) so em producao-edge-functions.
const SEGREDOS_DE_DEPLOY = [
  'SUPABASE_ACCESS_TOKEN',
  'CRON_SECRET',
  'PROMOGIFTS_SUPABASE_URL',
  'PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY',
  'EXTERNAL_SUPABASE_URL',
  'EXTERNAL_SUPABASE_SERVICE_ROLE_KEY',
  'PREVIEW_EGRESS_PROXY_URL',
  'PREVIEW_EGRESS_SHARED_SECRET',
];
const JOBS_DE_DEPLOY = new Set(['deploy-functions.yml:deploy', 'crm-sync-worker.yml:drain']);

test('parser de jobs: le environment inline e na forma longa, ignora comentario', () => {
  const amostra = [
    'on: workflow_dispatch',
    'jobs:',
    '  a:',
    '    environment: banco-leitura',
    '    steps:',
    '      - run: echo ${{ secrets.X }}',
    '  b:',
    '    environment:',
    '      name: producao-ddl',
    '      url: https://exemplo',
    '    steps:',
    '      # ${{ secrets.Y }} so em comentario',
    '      - run: echo ok',
    '  c:',
    '    steps:',
    '      - run: echo ${{ secrets.X }}',
  ].join('\n');
  const r = jobs(amostra);
  assert.deepEqual(
    r.map((j) => [j.nome, j.environment]),
    [['a', 'banco-leitura'], ['b', 'producao-ddl'], ['c', null]],
  );
  assert.ok(!/secrets\.Y/.test(r[1].texto), 'comentario nao pode contar como consumo');
  assert.ok(/secrets\.X/.test(r[2].texto));
});

test('W63: cada job que le DESTINO_URL declara o environment esperado', () => {
  const achados = consumidores('DESTINO_URL');
  const esperado = Object.entries(DESTINO_URL_POR_JOB)
    .map(([chave, environment]) => {
      const [arquivo, job] = chave.split(':');
      return { arquivo, job, environment };
    })
    .sort((a, b) => `${a.arquivo}:${a.job}`.localeCompare(`${b.arquivo}:${b.job}`));
  assert.deepEqual(
    achados,
    esperado,
    'consumidores de DESTINO_URL mudaram. Job sem environment perde o secret quando o valor sair do nivel repo; ' +
      'consumidor novo entra em DESTINO_URL_POR_JOB e no runbook docs/runbooks/migracao-segredos-environments.md.',
  );
});

const ENV_DE_DEPLOY = new Set(['producao-edge-functions']);
const porNome = (a, b) => a.localeCompare(b);

test('W62: cada job que le segredo de deploy declara producao-edge-functions', () => {
  const fora = [];
  const jobsVistos = new Set();
  for (const nome of SEGREDOS_DE_DEPLOY) {
    for (const c of consumidores(nome)) {
      jobsVistos.add(`${c.arquivo}:${c.job}`);
      if (!ENV_DE_DEPLOY.has(c.environment)) {
        fora.push(`${c.arquivo}:${c.job} le ${nome} com environment=${c.environment ?? '(nenhum)'}`);
      }
    }
  }
  assert.deepEqual(fora, [], fora.join('\n'));
  assert.deepEqual(
    [...jobsVistos].sort(porNome),
    [...JOBS_DE_DEPLOY].sort(porNome),
    'conjunto de jobs que leem segredos de deploy mudou — atualizar JOBS_DE_DEPLOY e o runbook',
  );
});

test('W62: crm-sync-worker le CRON_SECRET pelo environment producao-edge-functions', () => {
  assert.deepEqual(consumidores('CRON_SECRET').find((c) => c.arquivo === 'crm-sync-worker.yml'), {
    arquivo: 'crm-sync-worker.yml',
    job: 'drain',
    environment: 'producao-edge-functions',
  });
});

test.skip('W12: SETTINGS_GUARD_TOKEN so e lido pelo settings-guard, no environment perimetro-leitura', () => {
  assert.deepEqual(consumidores('SETTINGS_GUARD_TOKEN'), [
    { arquivo: 'settings-guard.yml', job: 'guard', environment: 'perimetro-leitura' },
  ]);
});

test.skip('W12: settings-guard le com o token administrativo e cai no github.token sem ele', () => {
  // Linha a linha (trim), sem regex multilinha (Sonar S5852).
  const linhas = wf['settings-guard.yml'].split('\n').map((l) => l.trim());
  assert.ok(
    linhas.includes('ADMIN_READ_TOKEN: ${{ secrets.SETTINGS_GUARD_TOKEN || github.token }}'),
    'sem o fallback, apagar/expirar o PAT faz o guard mandar "Bearer " vazio',
  );
  // As escritas (issue, PATCH de restauracao) continuam com o token do workflow, que
  // comenta como github-actions[bot] — o dedupe do guard depende desse autor.
  assert.ok(linhas.includes('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}'));
});

test('environments usados por segredo existem no baseline do perimetro', () => {
  const usados = new Set([
    ...Object.values(DESTINO_URL_POR_JOB).filter(Boolean),
    'producao-edge-functions',
    'perimetro-leitura',
  ]);
  const faltando = [...usados].filter((e) => !baseline.environments.includes(e));
  assert.deepEqual(faltando, [], `environment fora de scripts/ci/github-settings-baseline.json: ${faltando.join(', ')}`);
});

test('nenhum workflow que le segredo de environment roda em pull_request', () => {
  // Os environments-alvo usam branch policy `protected_branches`; um job de PR que os
  // declarasse ficaria bloqueado — e, sem o environment, leria o valor do nivel repo
  // enquanto ele existir. Os dois casos sao proibidos aqui.
  const segredos = ['DESTINO_URL', 'SETTINGS_GUARD_TOKEN', ...SEGREDOS_DE_DEPLOY];
  const arquivosConsumidores = new Set(segredos.flatMap((s) => consumidores(s).map((c) => c.arquivo)));
  const comPr = [...arquivosConsumidores].filter((a) => hasPullRequestTrigger(wf[a]));
  assert.deepEqual(comPr, [], `workflow com pull_request lendo segredo de environment: ${comPr.join(', ')}`);
});
