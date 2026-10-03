// E65: prova de que o registro no ledger nao passa com `statements` NULL, vazio
// ou divergente do arquivo.
//
// Antes desta etapa, o passo "Validar registro no ledger" do db-migrate.yml
// provava so' `count(*) = 1`: uma linha com statements NULL ou vazio era aceita,
// e a trilha de auditoria perdia o conteudo exato da migration. A verificacao do
// plano ("teste com ledger statements NULL -> ❌") esta no primeiro caso abaixo.
//
// O segundo bloco pina o SQL do passo: a contagem tem de exigir as duas
// condicoes, senao a comparacao de igualdade roda sobre uma linha que nem
// deveria ter passado.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { avaliarStatementsDoLedger, SQL_STATEMENTS_DO_LEDGER } from '../db-audit/verify-ledger-statements.mjs';
import { parseMigrationFile } from '../db-audit/register-migration.mjs';

const ARQUIVO = JSON.stringify(['create table a();', 'select 1;']);

test('ledger com statements NULL e recusado com motivo explicito', () => {
  const r = avaliarStatementsDoLedger({ bruto: 'null', statementsDoArquivo: JSON.parse(ARQUIVO) });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /statements IS NULL/);
});

test('ledger sem linha para version+name e recusado', () => {
  const r = avaliarStatementsDoLedger({ bruto: '\n', statementsDoArquivo: [] });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /nao retornou linha/);
});

test('array vazio e recusado (array_length = 0)', () => {
  const r = avaliarStatementsDoLedger({ bruto: '[]', statementsDoArquivo: [] });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /array_length/);
});

test('quantidade diferente e recusada', () => {
  const r = avaliarStatementsDoLedger({ bruto: '["select 1;"]', statementsDoArquivo: ['select 1;', 'select 2;'] });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /quantidade de statements difere/);
});

test('conteudo diferente e recusado nomeando o statement', () => {
  const r = avaliarStatementsDoLedger({ bruto: '["create table a();","select 2;"]', statementsDoArquivo: ['create table a();', 'select 1;'] });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /statement 2/);
});

test('ledger igual ao arquivo passa e informa o total', () => {
  const r = avaliarStatementsDoLedger({ bruto: ARQUIVO, statementsDoArquivo: JSON.parse(ARQUIVO) });
  assert.equal(r.ok, true);
  assert.equal(r.total, 2);
});

test('o parser do registro e o mesmo usado na comparacao (arquivo real)', async () => {
  // Uma migration real do repositorio: o parser devolve o que o ledger precisa
  // guardar, e a comparacao aceita exatamente isso.
  const conteudo = '-- comentario\nCREATE TABLE public.exemplo_e65 (id int);\n\nSELECT 1;\n';
  const { writeFile, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'e65-'));
  const arquivo = join(dir, '20261002000000_exemplo_e65.sql');
  await writeFile(arquivo, conteudo);
  const { statements } = parseMigrationFile(arquivo);
  assert.equal(statements.length, 2, 'comentario nao vira statement');
  const r = avaliarStatementsDoLedger({ bruto: JSON.stringify(statements), statementsDoArquivo: statements });
  assert.equal(r.ok, true);
});

test('a consulta do ledger devolve null textual em vez de linha vazia', () => {
  assert.match(SQL_STATEMENTS_DO_LEDGER, /coalesce\(array_to_json\(statements\)::text, 'null'\)/);
  assert.match(SQL_STATEMENTS_DO_LEDGER, /version = :'target_version'/);
  assert.match(SQL_STATEMENTS_DO_LEDGER, /name = :'target_name'/);
});

test('o passo do db-migrate exige NOT NULL e array_length antes de comparar', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/db-migrate.yml', import.meta.url), 'utf8');
  const inicio = workflow.indexOf('- name: Validar registro no ledger');
  const fim = workflow.indexOf('- name: Validar ledger completo do bundle de entrega atomica');
  assert.ok(inicio > 0 && fim > inicio, 'passo precisa existir e vir antes do proximo');
  const passo = workflow.slice(inicio, fim);
  assert.match(passo, /AND statements IS NOT NULL/);
  assert.match(passo, /AND array_length\(statements, 1\) > 0/);
  assert.match(passo, /verify-ledger-statements\.mjs/);
});
