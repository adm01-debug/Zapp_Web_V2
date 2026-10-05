#!/usr/bin/env node
/**
 * R2-INF-005 (reauditoria de 03/10/2026): prova em PostgreSQL 17 descartavel que
 * a consulta do passo "Validar registro no ledger" do db-migrate.yml EXECUTA.
 *
 * O defeito: tres linhas iniciadas por `#` (comentario de BASH) ficaram DENTRO
 * do heredoc entregue ao psql. O heredoc e' texto literal: para o psql aquelas
 * linhas nao sao comentario, sao SQL -- o parser aborta no `#` e a contagem
 * nunca acontece. O contrato E65 nao pegava porque conferia PRESENCA DE TEXTO no
 * YAML (procurar `AND statements IS NOT NULL`), e texto presente nao e' SQL que
 * roda. Depois do apply, um job vermelho ali nao significa "nada foi aplicado".
 *
 * Este teste nao usa uma copia da consulta: o heredoc e' extraido do proprio
 * workflow (extrair-consulta-ledger.mjs) e executado pelo psql do container,
 * com as mesmas variaveis (-v target_version/-v target_name) do passo real.
 *
 * Contrato de aceite coberto:
 *  - ledger NULL, vazio e ausente -> contagem 0 (o `test "$LEDGER_COUNT" = "1"`
 *    do passo reprova);
 *  - ledger equivalente -> contagem 1 E aprovacao do verificador real
 *    (SQL_STATEMENTS_DO_LEDGER + avaliarStatementsDoLedger);
 *  - ledger divergente -> contagem 1 mas verificador reprova nomeando o
 *    statement (contagem nao e' prova de conteudo);
 *  - contraprova: o mesmo heredoc com o comentario de Bash volta a travar a
 *    consulta, entao a regressao e' detectada por EXECUCAO, nao por texto.
 *
 * Roda com docker real (o wrapper de CI seta SKIP_DOCKER_SHIM=1):
 *   bash scripts/db-audit/retry-disposable-postgres-test.sh \
 *     node --test scripts/db-audit/ledger-postapply-query.integration.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';
import { extrairConsultaDoLedger } from './extrair-consulta-ledger.mjs';
import { parseMigrationFile } from './register-migration.mjs';
import { avaliarStatementsDoLedger, SQL_STATEMENTS_DO_LEDGER } from './verify-ledger-statements.mjs';

const raizDoRepo = path.resolve(fileURLToPath(import.meta.url), '../../..');
const consulta = extrairConsultaDoLedger(
  readFileSync(path.join(raizDoRepo, '.github/workflows/db-migrate.yml'), 'utf8'),
);

const imagem = process.env.LEDGER_POSTAPPLY_TEST_POSTGRES_IMAGE ?? 'postgres:17-alpine';
const container = `zapp-v2-ledger-postapply-${process.pid}`;
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'zapp-ledger-postapply-'));

const dockerStatus = (args, opcoes = {}) =>
  spawnSync(resolverExecutavel('docker'), args, { encoding: 'utf8', ...opcoes });

const dockerOk = (args, opcoes = {}) => {
  const r = dockerStatus(args, opcoes);
  if (r.status !== 0) {
    throw new Error(`docker ${args.join(' ')} falhou: ${String(r.stderr ?? '').trim()}`);
  }
  return r.stdout;
};

/** psql -qAt dentro do container; devolve a chamada crua para o teste conferir status/stderr. */
const psql = (entrada, argumentosExtras = []) =>
  spawnSync(
    resolverExecutavel('docker'),
    ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres', ...argumentosExtras],
    { input: entrada, encoding: 'utf8' },
  );

function removerContainer() {
  dockerStatus(['rm', '-f', container]);
  rmSync(tempDir, { recursive: true, force: true });
}

try {
  dockerStatus(['rm', '-f', container]);
  dockerOk(['run', '--rm', '-d', '--name', container, '--network', 'none',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', imagem]);

  let pronto = false;
  for (let i = 0; i < 60; i += 1) {
    if (dockerStatus(['exec', container, 'pg_isready', '-U', 'postgres']).status === 0) {
      pronto = true;
      break;
    }
    await delay(500);
  }
  if (!pronto) {
    // Mensagem com a assinatura de bootstrap que retry-disposable-postgres-test.sh
    // repete: falha de infraestrutura no start do container nao e' falha do contrato.
    throw new Error('FAIL: PostgreSQL de teste não iniciou (pg_isready sem resposta em 30s)');
  }

  const criacao = psql(`CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text primary key, name text, statements text[]);`);
  assert.equal(criacao.status, 0, `nao criamos o schema do ledger: ${String(criacao.stderr ?? '').trim()}`);
} catch (erro) {
  removerContainer();
  throw erro;
}

after(removerContainer);

// ── Fixtures: a migration "local" e as tres formas do ledger ────────────────────────────
const versao = '20261005120000';
const nome = 'exemplo_r2_inf_005';
const arquivo = path.join(tempDir, `${versao}_${nome}.sql`);
writeFileSync(arquivo, '-- comentario da migration\nCREATE TABLE public.exemplo_r2_inf_005 (id int);\n\nSELECT 1;\n');
const { statements } = parseMigrationFile(arquivo);

// Literal dollar-quoted: evita escapar aspas do conteudo da migration.
const literal = (texto, indice) => `$e${indice}$${texto}$e${indice}$`;
const arrayDoLedger = (lista) => `ARRAY[${lista.map((s, i) => literal(s, i)).join(', ')}]::text[]`;

function gravarLinha(listaOuNull, { version = versao, name = nome } = {}) {
  const valor = listaOuNull === null ? 'NULL' : arrayDoLedger(listaOuNull);
  const r = psql(`INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES (${literal(version, 0)}, ${literal(name, 1)}, ${valor})
    ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, statements = EXCLUDED.statements;`);
  assert.equal(r.status, 0, `falha ao gravar o ledger: ${String(r.stderr ?? '').trim()}`);
}

/** Reproduz a chamada exata do passo do workflow (mesmas -v). */
const contagemDoPasso = (version = versao, name = nome) =>
  psql(consulta, ['-v', `target_version=${version}`, '-v', `target_name=${name}`]);

test('R2-INF-005: o heredoc exato do passo executa e conta o registro equivalente', () => {
  gravarLinha(statements);
  const r = contagemDoPasso();
  assert.equal(r.status, 0, `a consulta do ledger nao executou: ${String(r.stderr ?? '').trim()}`);
  assert.equal(r.stdout.trim(), '1');
});

test('R2-INF-005: ledger NULL, vazio e ausente devolvem 0 (o passo reprova)', () => {
  gravarLinha(null);
  const nula = contagemDoPasso();
  assert.equal(nula.status, 0, `a consulta nao executou: ${String(nula.stderr ?? '').trim()}`);
  assert.equal(nula.stdout.trim(), '0', 'statements NULL tem de contar 0');

  gravarLinha([]);
  assert.equal(contagemDoPasso().stdout.trim(), '0', 'array vazio tem de contar 0');

  gravarLinha(statements);
  assert.equal(contagemDoPasso('20990101000000', 'nao_existe').stdout.trim(), '0', 'version ausente conta 0');
});

test('R2-INF-005: o verificador aprova o ledger equivalente e recusa o divergente', () => {
  const bruto = () =>
    psql(SQL_STATEMENTS_DO_LEDGER, ['-v', `target_version=${versao}`, '-v', `target_name=${nome}`]).stdout;

  gravarLinha(statements);
  const aprovado = avaliarStatementsDoLedger({ bruto: bruto(), statementsDoArquivo: statements });
  assert.deepEqual(aprovado, { ok: true, total: statements.length });

  const divergente = statements.map((s, i) => (i === 0 ? 'CREATE TABLE public.outra_r2_inf_005 (id int);' : s));
  gravarLinha(divergente);
  assert.equal(contagemDoPasso().stdout.trim(), '1', 'a contagem sozinha nao distingue conteudo');
  const recusado = avaliarStatementsDoLedger({ bruto: bruto(), statementsDoArquivo: statements });
  assert.equal(recusado.ok, false);
  assert.match(recusado.motivo, /statement 1/);

  gravarLinha(statements);
});

test('R2-INF-005: a contraprova com o comentario de Bash derruba a consulta', () => {
  gravarLinha(statements);
  const comBash = consulta.replace(/^(\s*)--/m, '$1#');
  assert.notEqual(comBash, consulta, 'a consulta do passo precisa ter comentario SQL para a contraprova');
  const r = psql(comBash, ['-v', `target_version=${versao}`, '-v', `target_name=${nome}`]);
  assert.notEqual(r.status, 0, 'comentario de Bash deveria travar a consulta');
  assert.match(String(r.stderr ?? ''), /#/u, 'o erro do psql tem de apontar o "#"');
});
