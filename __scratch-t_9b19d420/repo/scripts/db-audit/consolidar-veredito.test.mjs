// Prova do veredito do contrato vivo do DB Live Guard (R2-INF-021, item 368 do
// BACKLOG_VERIFICADO): a falha do check de fixtures de E2E (E85) tem de entrar no
// veredito (tabela do Job Summary + causa + passa a vermelho) e no alerta.
//
// O teste CHAMA a regra de producao (consolidar/executar/CLI) com tabela de casos
// e, para a ponte com o workflow, usa o proprio YAML como fonte: deriva de
// `tee /tmp/step-<id>.log` (convencao E43) a lista de passos que precisam estar
// no veredito. Sem a correcao — o passo de fixtures sem `id:` e fora da
// consolidacao — os dois lados falham.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PASSOS, ORDEM_CAUSA, consolidar, executar, linhasResumo, redigir, main } from './consolidar-veredito.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const WORKFLOW = fs.readFileSync(new URL('../../.github/workflows/db-live-guard.yml', import.meta.url), 'utf8');

// Nomes dos passos como o YAML os declara. Literal de proposito: e a fonte
// independente do registro do script, e trava os rotulos do alerta e o hash da
// causa (o dedupe do issue depende dele nao mudar).
const NOME_FIXTURES = 'Fixtures de E2E em producao (E85)';
const ID_FIXTURES = 'e2e-fixtures';
const LOG_FIXTURES = '/tmp/step-e2e-fixtures.log';
const NOME_MIGRATIONS = 'Comparar migrations com schema_migrations';

const sha = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

/** Contexto `steps` do job: todos verdes, com as sobrescritas pedidas. */
function stepsTodosVerdes(sobrescritas = {}) {
  return Object.fromEntries(PASSOS.map((passo) => [passo.id, { outcome: sobrescritas[passo.id] ?? 'success' }]));
}

/** Bloco YAML de um passo do job (do `- name: X` ate o proximo `- ` de 6 espacos). */
function blocoDoPasso(nome) {
  const texto = WORKFLOW.split('\n');
  const inicio = texto.findIndex((linha) => linha === `      - name: ${nome}`);
  assert.notEqual(inicio, -1, `passo "${nome}" nao existe em db-live-guard.yml`);
  let fim = texto.length;
  for (let i = inicio + 1; i < texto.length; i += 1) {
    if (texto[i].startsWith('      - ')) {
      fim = i;
      break;
    }
  }
  return texto.slice(inicio, fim).join('\n');
}

/** ids dos passos que gravam log em /tmp/step-<id>.log (convencao E43). */
function passosComLogNoWorkflow() {
  const ids = new Set();
  for (const bloco of WORKFLOW.split('\n      - ')) {
    const casados = bloco.match(/tee \/tmp\/step-([a-z0-9-]+)\.log/g) ?? [];
    for (const casado of casados) ids.add(casado.replace(/^tee \/tmp\/step-/, '').replace(/\.log$/, ''));
  }
  return [...ids].sort();
}

test('todos os passos verdes aprovam e nao escrevem falha', () => {
  const { codigo, saida, resultado } = executar({ stepsJson: JSON.stringify(stepsTodosVerdes()) });
  assert.equal(codigo, 0);
  assert.equal(resultado.falhas.length, 0);
  // Sem falha o heredoc escreve as chaves vazias, como o sed do YAML fazia.
  assert.equal(saida, 'causa=\nfalhas_lista=');
  const linhasTabela = linhasResumo(resultado).filter((l) => l.startsWith('| '));
  assert.equal(linhasTabela.length, PASSOS.length + 1); // 11 passos + cabecalho
  for (const passo of PASSOS) assert.ok(linhasTabela.includes(`| ${passo.nome} | ✅ |`));
});

test('cada passo, falhando sozinho, entra no veredito com a causa dele', () => {
  // Cobre o defeito na sua forma geral: nenhum passo de PASSOS pode sumir do
  // veredito. Com o check de fixtures fora do registro, o caso dele falha aqui.
  for (const passo of PASSOS) {
    const { codigo, resultado } = executar({
      stepsJson: JSON.stringify(stepsTodosVerdes({ [passo.id]: 'failure' })),
    });
    assert.equal(codigo, 1, `${passo.id} falhando nao deixou o veredito vermelho`);
    assert.deepEqual(resultado.nomes, [passo.nome], `${passo.id} nao aparece nos passos que falharam`);
    assert.equal(resultado.causa, sha(passo.nome), `${passo.id} gerou causa diferente do hash do nome do passo`);
  }
});

test('falha dos fixtures de E2E aparece na tabela, no alerta e com o trecho do log', () => {
  const passos = stepsTodosVerdes({ [ID_FIXTURES]: 'failure' });
  const log = ['ERRO: fixture de E2E ausente: contact camp-001 sem conversa', 'linha 2'].join('\n');
  const { codigo, resumo, saida, resultado } = executar({
    stepsJson: JSON.stringify(passos),
    lerLog: (caminho) => {
      assert.equal(caminho, LOG_FIXTURES);
      return log;
    },
  });

  assert.equal(codigo, 1, 'a falha do check de fixtures tem de derrubar o guarda vivo');
  assert.equal(resultado.causa, sha(NOME_FIXTURES));
  assert.ok(resumo.includes(`| ${NOME_FIXTURES} | ❌ (failure) |`), 'a tabela do Job Summary nao marca o passo de fixtures');
  assert.ok(resumo.includes(`#### \`${NOME_FIXTURES}\``), 'o Job Summary nao anexa o log do passo de fixtures');
  assert.ok(resumo.includes('fixture de E2E ausente'), 'o trecho do log do fixture nao entrou no summary');
  // O alerta monta o corpo a partir destas chaves.
  assert.ok(saida.includes(`falhas_lista=${NOME_FIXTURES}`), 'o alerta nao recebe o passo de fixtures em falhas_lista');
  assert.ok(saida.includes(`- ${NOME_FIXTURES}`), 'o output `passos` (corpo do alerta) nao lista o passo de fixtures');
  assert.deepEqual(resultado.logs, [{ nome: NOME_FIXTURES, log: LOG_FIXTURES }]);
  assert.ok(saida.includes(JSON.stringify(resultado.logs)), 'o alerta nao recebe o log do passo de fixtures');
});

test('passo pulado conta como falha e passo ausente do job tambem (falha fechado)', () => {
  const pulado = stepsTodosVerdes({ 'runtime-config': 'skipped' });
  assert.equal(executar({ stepsJson: JSON.stringify(pulado) }).codigo, 1);

  // Sem `id:` no YAML o passo nao existe no contexto `steps`: tem de contar como
  // falha, nao sumir (foi assim que o check de fixtures ficou invisivel).
  const semId = stepsTodosVerdes();
  delete semId[ID_FIXTURES];
  const { codigo, resumo, resultado } = executar({ stepsJson: JSON.stringify(semId) });
  assert.equal(codigo, 1);
  assert.deepEqual(resultado.nomes, [NOME_FIXTURES]);
  assert.ok(resumo.includes(`| ${NOME_FIXTURES} | ❌ (ausente) |`));
});

test('a causa canonica prefere o passo estrutural ao sintoma de fixtures', () => {
  const ambos = stepsTodosVerdes({ migrations: 'failure', [ID_FIXTURES]: 'failure' });
  const { resultado } = executar({ stepsJson: JSON.stringify(ambos) });
  assert.equal(resultado.raizId, 'migrations');
  assert.equal(resultado.causa, sha(NOME_MIGRATIONS));
  assert.deepEqual([...resultado.nomes].sort(), [NOME_FIXTURES, NOME_MIGRATIONS].sort());
  assert.ok(ORDEM_CAUSA.indexOf('migrations') < ORDEM_CAUSA.indexOf(ID_FIXTURES));
});

test('sem o contexto dos passos o veredito falha fechado em vez de passar verde', () => {
  for (const stepsJson of [undefined, '', 'nao-e-json', '[]']) {
    const { codigo, resumo, erro } = executar({ stepsJson });
    assert.equal(codigo, 1, `STEPS_JSON ${JSON.stringify(stepsJson)} devia falhar fechado`);
    assert.match(erro, /STEPS_JSON ausente ou invalido/);
    assert.ok(resumo.includes('STEPS_JSON ausente ou invalido'));
  }
});

test('o trecho do log nao vaza credencial', () => {
  // A URL e montada por concatenacao de proposito: o valor literal aqui seria uma
  // credencial bem formada e a varredura de segredo do hermes-tarefa-fechar (com
  // razao) recusa o commit por causa dela. O que importa e o texto final.
  const url = ['postgres', 'ql', '://', 'postgres', ':', 'segredo', '@', 'db.exemplo:5432/postgres'].join('');
  const sujo = `psql ${url}\nsenha password=segredo2 fim`;
  const limpo = redigir(sujo);
  assert.ok(!limpo.includes('segredo'), `credencial vazou: ${limpo}`);
  assert.equal(limpo, 'psql postgres://***@***\nsenha password=*** fim');
});

test('o CLI real escreve resumo e outputs e sai vermelho com o fixture faltando', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veredito-db-live-'));
  const resumo = path.join(dir, 'summary.md');
  const saida = path.join(dir, 'output.txt');
  const env = {
    ...process.env,
    STEPS_JSON: JSON.stringify(stepsTodosVerdes({ [ID_FIXTURES]: 'failure' })),
    GITHUB_STEP_SUMMARY: resumo,
    GITHUB_OUTPUT: saida,
  };
  const script = path.join('scripts', 'db-audit', 'consolidar-veredito.mjs');
  let codigo = 0;
  let stderr = '';
  try {
    execFileSync(process.execPath, [script], { cwd: RAIZ, env, encoding: 'utf8' });
  } catch (erro) {
    codigo = erro.status;
    stderr = erro.stderr ?? '';
  } finally {
    assert.equal(codigo, 1);
    assert.match(stderr, /Contrato vivo quebrado em: Fixtures de E2E em producao \(E85\)/);
    assert.ok(fs.readFileSync(resumo, 'utf8').includes(`| ${NOME_FIXTURES} | ❌ (failure) |`));
    assert.ok(fs.readFileSync(saida, 'utf8').includes(`falhas_lista=${NOME_FIXTURES}`));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('todo passo que grava /tmp/step-<id>.log tem id no YAML e registro no veredito', () => {
  const ids = passosComLogNoWorkflow();
  assert.ok(ids.length >= 11, `achei ${ids.length} passos com log; o workflow declara mais que isso`);

  const registrados = new Map(PASSOS.map((passo) => [passo.id, passo]));
  for (const id of ids) {
    const bloco = blocoDoPassoDoId(id);
    assert.ok(
      bloco.includes(`\n        id: ${id}\n`),
      `passo que grava /tmp/step-${id}.log nao declara \`id: ${id}\`: sem id ele nao existe no contexto steps e some do veredito`,
    );
    const passo = registrados.get(id);
    assert.ok(passo, `/tmp/step-${id}.log nao esta em PASSOS: a falha do passo nao entra no veredito`);
    assert.equal(passo.log, `/tmp/step-${id}.log`);
    assert.ok(
      bloco.startsWith(`name: ${passo.nome}\n`),
      `nome do passo ${id} divergiu do YAML: ${bloco.split('\n')[0]}`,
    );
  }

  // E o outro lado: passo registrado no veredito tem de existir no job.
  for (const passo of PASSOS) {
    assert.ok(ids.includes(passo.id), `PASSOS registra ${passo.id}, mas o job nao grava /tmp/step-${passo.id}.log`);
  }

  // A evidencia publicada tambem tem de levar o log de cada passo (o de fixtures
  // ficava de fora, junto com a omissao do veredito).
  const evidencia = blocoDoPasso('Publicar evidencias estruturais');
  for (const id of ids) {
    assert.ok(evidencia.includes(`/tmp/step-${id}.log`), `evidencia sem /tmp/step-${id}.log`);
  }
});

test('o job consolida pelo script e o alerta recebe os logs do proprio veredito', () => {
  const veredito = blocoDoPasso('Consolidar veredito do contrato vivo');
  assert.ok(
    veredito.includes('STEPS_JSON: ${{ toJSON(steps) }}'),
    'o veredito nao recebe o contexto steps inteiro: a lista de passos volta a ser escrita a mao',
  );
  assert.ok(veredito.includes('node scripts/db-audit/consolidar-veredito.mjs'));

  const alerta = blocoDoPasso('Abrir ou atualizar alerta de contrato vivo');
  assert.ok(
    alerta.includes('LOGS_FALHAS: ${{ steps.veredito.outputs.logs_falhas }}'),
    'o alerta nao recebe os logs do veredito e volta a manter a propria copia da lista de passos',
  );
});

/** Bloco do passo cujo `tee /tmp/step-<id>.log` e o informado. */
function blocoDoPassoDoId(id) {
  const blocos = WORKFLOW.split('\n      - ');
  const bloco = blocos.find((parte) => parte.includes(`tee /tmp/step-${id}.log`));
  assert.ok(bloco, `nao achei o passo que grava /tmp/step-${id}.log`);
  return bloco;
}

test('main escreve nos arquivos do GitHub e propaga o codigo de saida', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veredito-main-'));
  const resumo = path.join(dir, 'summary.md');
  const saida = path.join(dir, 'output.txt');
  const anterior = process.exitCode;
  try {
    const retorno = main({
      STEPS_JSON: JSON.stringify(stepsTodosVerdes()),
      GITHUB_STEP_SUMMARY: resumo,
      GITHUB_OUTPUT: saida,
    });
    assert.equal(retorno.codigo, 0);
    assert.equal(process.exitCode, 0);
    assert.match(fs.readFileSync(resumo, 'utf8'), /## Contrato DB vivo — \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
    assert.equal(fs.readFileSync(saida, 'utf8').trim(), 'causa=\nfalhas_lista=');
  } finally {
    process.exitCode = anterior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('o registro consolida exatamente os passos verificados pelo workflow', () => {
  // Consistencia entre o registro e o YAML: cada passo do contrato vivo aparece
  // uma vez, com nome e log conferidos contra o bloco do job.
  const idsNoYaml = passosComLogNoWorkflow();
  assert.deepEqual([...PASSOS.map((p) => p.id)].sort(), idsNoYaml);
  assert.deepEqual([...ORDEM_CAUSA].sort(), idsNoYaml);
  assert.deepEqual(
    consolidar(stepsTodosVerdes()).tabela.map((l) => l.nome),
    PASSOS.map((p) => p.nome),
  );
});
