import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const guard = new URL('../db-audit/supabase-usage-guard.mjs', import.meta.url);

function runGuard({ migrations = {}, callers = {}, catalog = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zapp-usage-guard-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'supabase', 'migrations'), { recursive: true });
    mkdirSync(join(root, 'scripts', 'db-audit'), { recursive: true });
    writeFileSync(join(root, 'supabase', 'schema-catalog.json'), JSON.stringify({
      generated_at: '2026-09-09', tables: [], views: [], functions: [],
      ...catalog,
    }));
    writeFileSync(join(root, 'scripts', 'db-audit', 'known-violations.json'), '{"known":[]}');
    for (const [file, content] of Object.entries(callers)) {
      writeFileSync(join(root, 'src', file), content);
    }
    for (const [file, content] of Object.entries(migrations)) {
      writeFileSync(join(root, 'supabase', 'migrations', file), content);
    }
    return spawnSync(process.execPath, [guard.pathname], {
      cwd: root,
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('usage guard projects a migration created on the catalog snapshot day', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_same_day.sql':
        'CREATE OR REPLACE FUNCTION public.same_day_rpc() RETURNS void LANGUAGE sql AS $$ SELECT $$;\n',
    },
    callers: { 'caller.ts': "supabase.rpc('same_day_rpc');\n" },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 0 relacoes, 1 funcoes/);
});

test('usage guard ignora rollback comentado e mantem a funcao criada no corpo', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_commented_rollback.sql':
        '-- rollback: DROP FUNCTION public.f();\n'
        + 'CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\n',
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 0 relacoes, 1 funcoes/);
});

test('usage guard ignora comentario de bloco com DROP TABLE', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_block_comment.sql':
        '/* DROP TABLE public.t */\n'
        + 'CREATE TABLE public.t (id integer);\n',
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 1 relacoes, 0 funcoes/);
});

test('usage guard nao trata "--" dentro de string como comentario', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_dash_in_string.sql':
        "COMMENT ON TABLE public.keep IS 'a--b'; CREATE TABLE public.keep (id integer);\n",
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 1 relacoes, 0 funcoes/);
});

test('usage guard ignora DDL dentro de corpo dollar-quoted', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_drop_in_body.sql':
        'CREATE TABLE public.ghost (id integer);\n'
        + 'CREATE FUNCTION public.f() RETURNS void AS $$\n'
        + 'BEGIN\n'
        + '  DROP TABLE public.ghost;\n'
        + 'END;\n'
        + '$$ LANGUAGE plpgsql;\n',
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 1 relacoes, 1 funcoes/);
});
