import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agregar, duracaoMinutos, maisLentos, tabela, tabelaLentos } from './actions-kpi.mjs';

const AGORA = Date.parse('2026-10-03T12:00:00Z');
const run = (nome, minutos, conclusao, diasAtras = 0) => ({
  name: nome,
  conclusion: conclusao,
  run_started_at: new Date(AGORA - diasAtras * 86400000).toISOString(),
  updated_at: new Date(AGORA - diasAtras * 86400000 + minutos * 60000).toISOString(),
});

test('E79: agregar conta runs, cancelados, falhas e minutos por workflow', () => {
  const linhas = agregar(
    [
      run('CI', 10, 'success'),
      run('CI', 20, 'cancelled'),
      run('CI', 5, 'failure'),
      run('CodeQL', 3, 'success'),
    ],
    { agora: AGORA },
  );
  const ci = linhas.find((l) => l.workflow === 'CI');
  assert.equal(ci.runs, 3);
  assert.equal(ci.cancelados, 1);
  assert.equal(ci.falhas, 1);
  assert.equal(ci.minutos, 35);
  assert.equal(ci.taxaCancelamento, 33.3);
  assert.equal(ci.taxaFalha, 33.3);
  assert.equal(linhas[0].workflow, 'CI', 'o mais frequente vem primeiro');
});

test('E79: a janela corta run velho — o KPI e dos ultimos N dias, nao de sempre', () => {
  const linhas = agregar([run('CI', 10, 'success', 1), run('CI', 99, 'success', 30)], { agora: AGORA, janelaDias: 7 });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].runs, 1, 'run de 30 dias atras nao pode entrar na janela de 7');
  assert.equal(linhas[0].minutos, 10);
});

test('E79: duracao vem dos carimbos e nunca e negativa', () => {
  assert.equal(duracaoMinutos(run('CI', 7, 'success')), 7);
  assert.equal(duracaoMinutos({}), 0, 'sem carimbo, zero -- nao NaN');
  assert.equal(
    duracaoMinutos({ run_started_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T11:00:00Z' }),
    0,
    'fim antes do inicio nao vira minutos negativos',
  );
  assert.equal(duracaoMinutos({ run_started_at: 'nao-e-data', updated_at: 'tambem-nao' }), 0);
});

test('E79: os 5 jobs mais lentos saem ordenados e limitados', () => {
  const jobs = [
    { name: 'a', workflow_name: 'CI', started_at: '2026-10-03T10:00:00Z', completed_at: '2026-10-03T10:01:00Z' },
    { name: 'b', workflow_name: 'CI', started_at: '2026-10-03T10:00:00Z', completed_at: '2026-10-03T10:30:00Z' },
    { name: 'c', workflow_name: 'CI', started_at: '2026-10-03T10:00:00Z', completed_at: '2026-10-03T10:10:00Z' },
  ];
  const lentos = maisLentos(jobs, { limite: 2 });
  assert.equal(lentos.length, 2);
  assert.deepEqual(lentos.map((l) => l.job), ['b', 'c']);
});

test('E79: a tabela traz as colunas pedidas e o total', () => {
  const md = tabela(agregar([run('CI', 10, 'success'), run('CI', 20, 'cancelled')], { agora: AGORA }));
  assert.match(md, /\| workflow \| runs \| cancelados \| taxa cancel\. \| falhas \| taxa falha \| minutos \|/);
  assert.match(md, /Total: \*\*2\*\* runs, \*\*30\*\* minutos\./);
  assert.match(tabelaLentos([]), /nenhum job/);
});

test('E79: o workflow semanal chama o KPI com as permissoes que ele precisa', () => {
  const y = readFileSync(new URL('../../.github/workflows/branch-hygiene-audit.yml', import.meta.url), 'utf8');
  assert.match(y, /node scripts\/ci\/actions-kpi\.mjs/, 'o workflow tem de rodar o KPI');
  // O zizmor reprova `write` no nivel do WORKFLOW (excessive-permissions, severidade
  // alta): o escopo vale para todos os jobs. As permissoes extras ficam no job, onde
  // o escopo e exatamente o que ele usa -- foi o que o CI pegou no primeiro PR.
  const topo = y.slice(0, y.indexOf('jobs:'));
  assert.doesNotMatch(topo, /issues:\s*write/, 'write no nivel do workflow o zizmor reprova');
  assert.doesNotMatch(topo, /actions:\s*read/, 'nem actions: read deve ficar no topo');
  const job = y.slice(y.indexOf('jobs:'));
  assert.match(job, /actions:\s*read/, 'listar runs exige actions: read (no job)');
  assert.match(job, /issues:\s*write/, 'publicar a issue semanal exige issues: write (no job)');
});
