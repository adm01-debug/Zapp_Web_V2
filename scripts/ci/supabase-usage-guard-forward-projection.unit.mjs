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

test('usage guard ignora comentario de bloco ANINHADO com DROP TABLE', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_nested_block_comment.sql':
        '/* outer /* inner */ DROP TABLE public.t */\n'
        + 'CREATE TABLE public.t (id integer);\n',
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 1 relacoes, 0 funcoes/);
});

test('usage guard preserva tokens quando comentario fica entre keywords sem espaco', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_inline_comment.sql':
        'CREATE/* c */FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\n',
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 0 relacoes, 1 funcoes/);
});

test('usage guard nao engole SQL apos E-string com backslash-escape (fail-open)', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_escape_string.sql':
        'CREATE TABLE public.t (id integer);\n'
        + "INSERT INTO public.audit(note) VALUES (E'\\'');\n"
        + 'DROP TABLE public.t;\n',
    },
    callers: { 'c.ts': "supabase.from('t').select('*');\n" },
  });
  // E'\'' e uma unica string; o DROP TABLE seguinte e DDL real e deixa t fora da
  // projecao, orfando o caller -> violacao (exit != 0).
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /\.from\('t'\)/);
});

test('usage guard nao trata texto de E-string com escape como DDL (falso positivo)', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_escape_string_text.sql':
        'CREATE TABLE public.t (id integer);\n'
        + "INSERT INTO public.audit(note) VALUES (E'temos, e\\' nao use DROP TABLE public.t aqui');\n",
    },
    callers: { 'c.ts': "supabase.from('t').select('*');\n" },
  });
  // O "DROP TABLE public.t" e TEXTO dentro de um E-string; nao e DDL. A projecao
  // mantem t e o caller fica atendido -> sem violacao (exit 0).
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 1 relacoes, 0 funcoes/);
});

test('usage guard detecta DROP de tabela ja catalogada (uniao nao restaura)', () => {
  const result = runGuard({
    catalog: { tables: ['playbooks'] },
    migrations: {
      '20260909210000_drop_cataloged_table.sql': 'DROP TABLE public.playbooks;\n',
    },
    callers: { 'c.ts': "supabase.from('playbooks').select('*');\n" },
  });
  // DROP de tabela do catalogo deve sair da projecao e orfar o caller.
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /\.from\('playbooks'\)/);
});

test('usage guard detecta DROP com identificador entre aspas (public."t")', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_drop_quoted_ident.sql':
        'CREATE TABLE public.t (id integer);\n'
        + 'DROP TABLE public."t";\n',
    },
    callers: { 'c.ts': "supabase.from('t').select('*');\n" },
  });
  // "t" e identificador (nome de objeto), nao string: o DROP deve casar.
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /\.from\('t'\)/);
});

test('usage guard detecta DROP ROUTINE de funcao', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_drop_routine.sql':
        'CREATE FUNCTION public.fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;\n'
        + 'DROP ROUTINE public.fn();\n',
    },
    callers: { 'c.ts': "supabase.rpc('fn');\n" },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /\.rpc\('fn'\)/);
});

test('usage guard mantem funcao recriada por DROP+CREATE na mesma migration', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_recria_assinatura.sql':
        'DROP FUNCTION IF EXISTS public.search_contacts(text);\n'
        + 'CREATE FUNCTION public.search_contacts(term text, include_legacy boolean DEFAULT false)'
        + ' RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;\n',
    },
    callers: { 'c.ts': "supabase.rpc('search_contacts');\n" },
  });
  // DROP + CREATE do mesmo nome (troca de assinatura, padrao do repo para
  // adicionar um parametro) deve MANTER a funcao: o CREATE vem depois no texto e
  // vence. Sem a ordem textual (dois loops separados: CREATEs e depois DROPs), o
  // DROP apagaria a funcao da projecao -> falso positivo "alvo nao existe".
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 0 relacoes, 1 funcoes/);
});

test('usage guard projeta e valida objeto de outro schema (supabase.schema)', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_ops_audit.sql':
        'CREATE TABLE ops.audit_log (id integer);\n'
        + 'CREATE FUNCTION ops.log_event(p text) RETURNS void LANGUAGE sql AS $$ SELECT $$;\n',
    },
    callers: {
      'c.ts': "supabase.schema('ops').from('audit_log').select('*');\n"
        + "supabase.schema('ops').rpc('log_event', { p: 'x' });\n",
    },
  });
  // O caller aponta para ops.audit_log / ops.log_event e a migration da janela
  // criou exatamente esses objetos: sem o schema no scan e na projecao, o guard
  // compararia 'audit_log' com o catalogo public e acusaria alvo inexistente.
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 1 relacoes, 1 funcoes/);
});

test('usage guard ainda acusa alvo ausente em schema nao-public', () => {
  const result = runGuard({
    migrations: { '20260909210000_ops.sql': 'CREATE TABLE ops.existe (id integer);\n' },
    callers: { 'c.ts': "supabase.schema('ops').from('nao_existe').select('*');\n" },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /\('nao_existe'\)/);
});

test('usage guard honra SET standard_conforming_strings = off (backslash escapa em string normal)', () => {
  const result = runGuard({
    catalog: { tables: ['t'] },
    migrations: {
      '20260909210000_scs_off.sql':
        'SET standard_conforming_strings = off;\n'
        + "SELECT 'a\\'b' AS x;\n"
        + 'DROP TABLE public.t;\n',
    },
    callers: { 'c.ts': "supabase.from('t').select('*');\n" },
  });
  // Com SCS=off o backslash escapa a aspa em string NORMAL (medido no PG 17.11:
  // psql -f aplica o SET num statement separado e SELECT 'a\'b' devolve a'b, so
  // com WARNING). O DROP seguinte e DDL real e tira t da projecao. Sem honrar o
  // SET, o scanner fecha a string no \' e engole o DROP -> fail-open.
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /\.from\('t'\)/);
});

test('usage guard reconhece dollar-quote com tag nao-ASCII', () => {
  const result = runGuard({
    migrations: {
      '20260909210000_dollar_unicode.sql':
        'CREATE TABLE public.t (id integer);\n'
        + 'SELECT $ação$ DROP TABLE public.t; $ação$;\n',
    },
    callers: { 'c.ts': "supabase.from('t').select('*');\n" },
  });
  // O DROP esta DENTRO do dollar-quote (texto, nao DDL) e a tag nao-ASCII e
  // valida no PG (medido: $ação$ ... $ação$ e aceito e devolve x). Sem reconhecer
  // a tag, o conteudo vira tokens e o DROP falso remove t -> falso positivo.
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 1 relacoes, 0 funcoes/);
});

test('usage guard mantem funcao quando outra assinatura (overload) sobrevive', () => {
  const result = runGuard({
    catalog: {
      functions: ['can_edit_contact'],
      function_signatures: [
        'can_edit_contact(p_assigned_to uuid, p_queue_id uuid)->boolean|kind=f',
        'can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible_agent_ids uuid[],'
          + ' p_profile_id uuid, p_is_admin boolean)->boolean|kind=f',
      ],
    },
    migrations: {
      '20260909210000_drop_uma_assinatura.sql':
        'DROP FUNCTION public.can_edit_contact(uuid, uuid);\n',
    },
    callers: { 'c.ts': "supabase.rpc('can_edit_contact');\n" },
  });
  // Sobrou a assinatura de 5 argumentos: rpc('can_edit_contact') continua valido.
  // Remover o NOME inteiro no DROP de UMA assinatura seria falso positivo.
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /projecao forward-only: 0 relacoes, 1 funcoes/);
});

test('usage guard remove a funcao quando TODAS as assinaturas sao dropadas', () => {
  const result = runGuard({
    catalog: {
      functions: ['f'],
      function_signatures: ['f(a integer)->void|kind=f', 'f(b text)->void|kind=f'],
    },
    migrations: {
      '20260909210000_drop_todas.sql':
        'DROP FUNCTION public.f(integer);\n'
        + 'DROP FUNCTION public.f(text);\n',
    },
    callers: { 'c.ts': "supabase.rpc('f');\n" },
  });
  // Sem assinatura sobrando, o nome sai da projecao e o caller fica orfao.
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /\.rpc\('f'\)/);
});
