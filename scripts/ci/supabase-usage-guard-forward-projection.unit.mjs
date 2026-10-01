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

test('usage guard honra todas as formas de SET/RESET de standard_conforming_strings que o PG aceita', () => {
  // Sonda identica a usada no PG 17.11: a migration liga/desliga o SCS e depois
  // faz `SELECT 'a\';`. Com o SCS OFF a string fica ABERTA e o DROP seguinte e
  // texto (o alvo continua na projecao -> exit 0); com o SCS ON a string fecha no
  // \' e o DROP roda (o alvo sai -> exit 1).
  const casos = [
    ['SET standard_conforming_strings = off;', 0],
    ['SET standard_conforming_strings = false;', 0], // false = off (medido)
    ['SET standard_conforming_strings = 0;', 0],
    ['SET standard_conforming_strings = no;', 0],
    ["SET standard_conforming_strings = 'Off';", 0], // case-insensitive, citado
    ['SET "standard_conforming_strings" = off;', 0], // nome do parametro citado
    ['SET SESSION standard_conforming_strings = off;', 0],
    ['SET standard_conforming_strings TO off;', 0],
    ["SELECT set_config('standard_conforming_strings', 'off', false);", 0],
    ['SET standard_conforming_strings = on;', 1],
    ['SET standard_conforming_strings = true;', 1],
    ['SET standard_conforming_strings = default;', 1],
    ['SET standard_conforming_strings = 2;', 1], // PG rejeita -> continua on
    ['SET standard_conforming_strings = off; RESET standard_conforming_strings;', 1],
    ['SET standard_conforming_strings = off; RESET ALL;', 1],
    ['SET standard_conforming_strings = off; DISCARD ALL;', 1],
    ['SET LOCAL standard_conforming_strings = off;', 1], // fora de transacao nao vale
    ['BEGIN;\nSET LOCAL standard_conforming_strings = off;\nCOMMIT;', 1], // revertido no COMMIT
  ];
  for (const [forma, esperado] of casos) {
    const result = runGuard({
      migrations: {
        '20260909210000_scs.sql':
          'CREATE TABLE public.t (id integer);\n'
          + `${forma}\n`
          + "SELECT 'a\\';\n"
          + 'DROP TABLE public.t;\n',
      },
      callers: { 'c.ts': "supabase.from('t').select('*');\n" },
    });
    assert.equal(result.status, esperado, `${forma}\n${result.stdout}${result.stderr}`);
  }
});

test('usage guard projeta VIEW (CREATE/DROP/MATERIALIZED) e RENAME TO', () => {
  const casos = [
    ['DROP VIEW de view catalogada usada por caller',
      { '20260909210000_a.sql': 'DROP VIEW IF EXISTS public.v;\n' },
      { 'c.ts': "supabase.from('v').select('*');\n" }, { views: ['v'] }, 1],
    ['CREATE OR REPLACE VIEW na janela nao e falso positivo',
      { '20260909210000_b.sql': 'CREATE OR REPLACE VIEW public.nova AS SELECT 1 AS x;\n' },
      { 'c.ts': "supabase.from('nova').select('*');\n" }, {}, 0],
    ['ALTER TABLE ... RENAME TO tira o nome antigo da projecao',
      { '20260909210000_c.sql': 'ALTER TABLE public.x RENAME TO x_novo;\n' },
      { 'c.ts': "supabase.from('x').select('*');\n" }, { tables: ['x'] }, 1],
    ['DROP TABLE sem prefixo de schema (search_path = public)',
      { '20260909210000_d.sql': 'DROP TABLE x;\n' },
      { 'c.ts': "supabase.from('x').select('*');\n" }, { tables: ['x'] }, 1],
    ['DROP MATERIALIZED VIEW',
      { '20260909210000_e.sql': 'DROP MATERIALIZED VIEW public.mv;\n' },
      { 'c.ts': "supabase.from('mv').select('*');\n" }, { views: ['mv'] }, 1],
    ['ALTER TABLE RENAME TO com o nome novo mantem caller do nome novo',
      { '20260909210000_f.sql':
        'ALTER TABLE public.x RENAME TO x_novo;\n'
        + 'ALTER VIEW public.w RENAME TO w_novo;\n' },
      { 'c.ts': "supabase.from('x_novo').select('*');\nsupabase.from('w_novo').select('*');\n" },
      { tables: ['x'], views: ['w'] }, 0],
  ];
  for (const [desc, migrations, callers, catalog, esperado] of casos) {
    const result = runGuard({ migrations, callers, catalog });
    assert.equal(result.status, esperado, `${desc}\n${result.stdout}${result.stderr}`);
  }
});

test('usage guard compara assinatura na forma CANONICA do PG (alias, typmod, OUT)', () => {
  // Sondas medidas no PG 17. O catalogo grava pg_get_function_identity_arguments,
  // que sempre vem na forma canonica — int4 -> integer, varchar(50) -> character
  // varying, numeric(10,2) -> numeric, timestamptz -> timestamp with time zone,
  // timestamp -> timestamp without time zone, bool -> boolean — e INCLUI os
  // argumentos OUT. O DROP, porem, usa a assinatura do regprocedure: f(integer,
  // OUT boolean) e dropado por f(integer), e o OUT nao conta. INOUT conta.
  // Sem canonicalizar, o DROP de uma assinatura que EXISTE nao casa e a funcao
  // (com caller valido) fica na projecao — falso-negativo.
  const casos = [
    ['alias int4 no DROP x integer no catalogo',
      { '20260909210000_a.sql': 'DROP FUNCTION public.f(int4);\nDROP FUNCTION public.f(text);\n' },
      { functions: ['f'], function_signatures: ['f(p_a integer)->void|kind=f', 'f(p_b text)->void|kind=f'] }, 1],
    ['typmod varchar(50) no DROP x character varying no catalogo',
      { '20260909210000_b.sql': 'DROP FUNCTION public.g(varchar(50));\nDROP FUNCTION public.g(integer);\n' },
      { functions: ['g'], function_signatures: ['g(p_a character varying)->void|kind=f', 'g(p_b integer)->void|kind=f'] }, 1],
    ['numeric(10,2) no DROP x numeric no catalogo',
      { '20260909210000_c.sql': 'DROP FUNCTION public.h(numeric(10,2));\nDROP FUNCTION public.h(integer);\n' },
      { functions: ['h'], function_signatures: ['h(p_a numeric)->void|kind=f', 'h(p_b integer)->void|kind=f'] }, 1],
    ['timestamptz no DROP x timestamp with time zone no catalogo',
      { '20260909210000_d.sql': 'DROP FUNCTION public.i(timestamptz);\nDROP FUNCTION public.i(integer);\n' },
      { functions: ['i'], function_signatures: ['i(p_a timestamp with time zone)->void|kind=f', 'i(p_b integer)->void|kind=f'] }, 1],
    ['bool no DROP x boolean no catalogo',
      { '20260909210000_e.sql': 'DROP FUNCTION public.j(bool);\nDROP FUNCTION public.j(integer);\n' },
      { functions: ['j'], function_signatures: ['j(p_a boolean)->void|kind=f', 'j(p_b integer)->void|kind=f'] }, 1],
    ['OUT nao faz parte da identidade do DROP (INOUT faz)',
      { '20260909210000_f.sql': 'DROP FUNCTION public.k(integer);\nDROP FUNCTION public.k(text);\n' },
      { functions: ['k'], function_signatures: ['k(p_a integer, OUT p_b boolean)->boolean|kind=f', 'k(p_c text)->void|kind=f'] }, 1],
    ['INOUT continua na identidade do DROP',
      { '20260909210000_g.sql': 'DROP FUNCTION public.l(integer, boolean);\nDROP FUNCTION public.l(text);\n' },
      { functions: ['l'], function_signatures: ['l(p_a integer, INOUT p_b boolean)->boolean|kind=f', 'l(p_c text)->void|kind=f'] }, 1],
    ['DEFAULT (valor apagado pelo lexer) nao entra na assinatura',
      { '20260909210000_h.sql':
        "CREATE FUNCTION public.m(p_a text DEFAULT 'x,y') RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\n"
        + 'DROP FUNCTION public.m(text);\nDROP FUNCTION public.m(integer);\n' },
      { functions: ['m'], function_signatures: ['m(p_a integer)->void|kind=f'] }, 1],
  ];
  for (const [desc, migrations, catalog, esperado] of casos) {
    // O caller tem de citar SO a funcao do caso: um rpc de outra funcao geraria
    // violacao por alvo inexistente e o teste passaria/falharia pelo motivo errado.
    const caller = `supabase.rpc('${catalog.functions[0]}');\n`;
    const result = runGuard({ migrations, callers: { 'c.ts': caller }, catalog });
    assert.equal(result.status, esperado, `${desc}\n${result.stdout}${result.stderr}`);
  }
});

test('usage guard nao trata DROP IF EXISTS de assinatura inexistente como remocao', () => {
  // Medido no PG 17: `DROP FUNCTION IF EXISTS public.j(uuid, uuid)` sobre j(uuid)
  // e NO-OP (NOTICE ... skipping) e a funcao SOBREVIVE. O guard nao pode retirar
  // o nome da projecao so porque o nome casou — o DROP tem de casar a ASSINATURA.
  const casos = [
    ['IF EXISTS de assinatura que nao existe mantem a funcao (caller segue valido)',
      { '20260909210000_a.sql': 'DROP FUNCTION IF EXISTS public.j(uuid, uuid);\n' },
      { functions: ['j'], function_signatures: ['j(p_a uuid)->void|kind=f'] }, 0],
    ['IF EXISTS da assinatura certa remove',
      { '20260909210000_b.sql': 'DROP FUNCTION IF EXISTS public.k(uuid);\n' },
      { functions: ['k'], function_signatures: ['k(p_a uuid)->void|kind=f'] }, 1],
    ['DROP sem IF EXISTS de assinatura inexistente tambem e no-op',
      { '20260909210000_c.sql': 'DROP FUNCTION public.l(uuid, uuid);\n' },
      { functions: ['l'], function_signatures: ['l(p_a uuid)->void|kind=f'] }, 0],
  ];
  for (const [desc, migrations, catalog, esperado] of casos) {
    const caller = `supabase.rpc('${catalog.functions[0]}');\n`;
    const result = runGuard({ migrations, callers: { 'c.ts': caller }, catalog });
    assert.equal(result.status, esperado, `${desc}\n${result.stdout}${result.stderr}`);
  }
});

test('usage guard honra .schema() separado do .from()/.rpc() por comentario', () => {
  // O scan procura `.schema('x')` nos 150 caracteres antes do `.from(...)`. Se o
  // reconhecimento exigir que ele seja o ULTIMO trecho (um `/* ... */` no meio
  // conta como codigo), o guard cai no schema padrao `public` e compara o alvo
  // errado — falso positivo quando o objeto so existe no outro schema, e
  // fail-open quando existe um homonimo em public.
  const MIG = { '20260909210000_ops.sql': 'CREATE TABLE ops.x (id integer);\n' };
  const casos = [
    ['adjacente (baseline)', "supabase.schema('ops').from('x').select('*');\n", 0],
    ['quebra de linha entre os metodos', "supabase\n  .schema('ops')\n  .from('x')\n  .select('*');\n", 0],
    ['comentario de bloco entre', "supabase.schema('ops') /* ops */ .from('x').select('*');\n", 0],
    ['comentario de linha entre', "supabase.schema('ops') // ops\n  .from('x').select('*');\n", 0],
    ['comentario de bloco dentro do schema()', "supabase.schema(/* ops */ 'ops').from('x').select('*');\n", 0],
    ['comentario de linha dentro do schema()', "supabase.schema(// ops\n  'ops').from('x').select('*');\n", 0],
    ['comentario que CITA outro .schema() e ignorado', "supabase.schema('ops') /* .schema('public') */ .from('x').select('*');\n", 0],
    ['comentario de linha citando outro schema', "supabase.schema('ops') // .schema('public')\n  .from('x').select('*');\n", 0],
  ];
  for (const [desc, caller, esperado] of casos) {
    const result = runGuard({ migrations: MIG, callers: { 'c.ts': caller } });
    assert.equal(result.status, esperado, `${desc}\n${result.stdout}${result.stderr}`);
  }
});

test('usage guard nao deixa passar alvo de outro schema escondido por comentario', () => {
  // `public.x` existe (criado na janela) e `ops.x` NAO. O alvo real do caller e
  // ops.x, entao o guard tem de acusar; se o comentario fizer o `public` voltar,
  // ele aprova um alvo que nao existe — fail-open.
  const result = runGuard({
    migrations: { '20260909210000_pub.sql': 'CREATE TABLE public.x (id integer);\n' },
    callers: { 'c.ts': "supabase.schema('ops') /* ops */ .from('x').select('*');\n" },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /ops\.x/);
});
