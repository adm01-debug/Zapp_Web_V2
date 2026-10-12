/**
 * E97 — prioridade MANUAL do contato (colunas manual_priority / _by / _at, RPC
 * public.set_manual_priority e a regra pura public.effective_priority).
 *
 * Prova, num PostgreSQL 17 descartavel, que:
 *   - a unica via de escrita e public.set_manual_priority, sob o MESMO predicado de
 *     permissao do modulo Contatos (public.can_edit_contact) e com trilha em audit_logs;
 *   - a prioridade da IA (ai_priority) reescrita pela analise NAO apaga a manual;
 *   - effective_priority = coalesce(manual, ia).
 *
 * Fidelidade: as funcoes de plataforma que a correcao reusa
 * (public.can_edit_contact nas DUAS assinaturas, is_admin_or_supervisor,
 * get_visible_agent_ids, get_profile_id_for_user, ai_is_canonical_priority) sao
 * lidas da ULTIMA definicao em supabase/migrations/*.sql e o DDL sob teste e o
 * arquivo REAL da migration — nada de SQL copiado para dentro do teste.
 *
 * Roda com: node --test scripts/db-audit/manual-priority.test.mjs
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');
const POSTGRES_IMAGE = process.env.POSTGRES_TEST_IMAGE
  || process.env.CATALOG_TEST_POSTGRES_IMAGE
  || 'postgres:17-alpine';
const CONTAINER = `zapp-v2-manual-priority-test-${process.pid}`;

// id fixos do cenario (users = auth.uid(), profiles = vinculo)
const U_ADMIN = '11111111-1111-1111-1111-111111111111';
const U_OWNER = '22222222-2222-2222-2222-222222222222';
const U_QUEUE = '33333333-3333-3333-3333-333333333333';
const U_OUT = '44444444-4444-4444-4444-444444444444';
const U_X = '55555555-5555-5555-5555-555555555555';
const P_OWNER = 'aaaaaaaa-0000-0000-0000-000000000001';
const P_QUEUE = 'aaaaaaaa-0000-0000-0000-000000000002';
const P_OUT = 'aaaaaaaa-0000-0000-0000-000000000003';
const P_ADMIN = 'aaaaaaaa-0000-0000-0000-000000000004';
const P_X = 'aaaaaaaa-0000-0000-0000-000000000005';
const Q_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

// contatos
const C_OWNER = 'cccccccc-0000-0000-0000-000000000001'; // atribuido ao U_OWNER
const C_QUEUE = 'cccccccc-0000-0000-0000-000000000002'; // fila Q, atribuido a P_X
const C_OUT = 'cccccccc-0000-0000-0000-000000000003'; // fora do alcance de U_OUT
const C_DEL = 'cccccccc-0000-0000-0000-000000000004'; // excluido, atribuido ao U_OWNER

function docker(args, input) {
  return execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function psql(sql) {
  return docker(
    ['exec', '-i', CONTAINER, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres'],
    sql,
  );
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    let logs = '';
    try {
      logs = docker(['logs', CONTAINER]);
    } catch {
      logs = '';
    }
    if (logs.includes('PostgreSQL init process complete; ready for start up.')) {
      try {
        docker(['exec', CONTAINER, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1',
          '-U', 'postgres', '-d', 'postgres', '-c', 'SELECT 1']);
        return;
      } catch {
        // ainda subindo
      }
    }
    sleepMs(1000);
  }
  throw new Error('PostgreSQL de teste nao ficou pronto em 60 segundos.');
}

/**
 * Executa `callSql` no papel `role` com `request.jwt.claim.sub = userId` e devolve
 * 'OK' ou o SQLSTATE do erro — sem depender de NOTICE (que vai para stderr).
 */
function probeSqlstate(role, userId, callSql) {
  const claim = `select set_config('request.jwt.claim.sub', ${userId ? `'${userId}'` : "''"}, false);`;
  const out = psql(`
create temp table _probe(state text);
grant all on _probe to authenticated, anon, service_role;
${claim}
set role ${role};
do $$ declare v_state text; begin
  begin
    ${callSql};
    v_state := 'OK';
  exception when others then
    v_state := sqlstate;
  end;
  insert into pg_temp._probe values (v_state);
end $$;
reset role;
select state from pg_temp._probe;
`);
  return out.trim().split('\n').pop().trim();
}

/** Le colunas de um contato (como postgres, sem RLS). */
function row(contactId) {
  const out = psql(`select coalesce(manual_priority,'<null>') || '|' || coalesce(manual_priority_by::text,'<null>')
    || '|' || (manual_priority_at is not null) || '|' || coalesce(public.effective_priority(c),'<null>')
    from public.contacts c where c.id = '${contactId}';`);
  const [priority, by, atSet, effective] = out.trim().split('|');
  return { priority, by, atSet: atSet === 'true', effective };
}

function auditCount(action = 'contact_manual_priority_changed') {
  return Number(psql(`select count(*) from public.audit_logs where action = '${action}';`).trim());
}

function lastAuditPriority() {
  return psql(`select coalesce(details->>'priority','<null>') from public.audit_logs
    where action='contact_manual_priority_changed' order by created_at desc, id desc limit 1;`).trim();
}

/** Captura o bloco CREATE [OR REPLACE] FUNCTION public.<nome>( MAIS RECENTE do arquivo. */
function findCreateFunctionBlock(sql, name) {
  const header = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,
    'gi',
  );
  let start = -1;
  for (const match of sql.matchAll(header)) start = match.index;
  if (start === -1) return null;
  const tagMatch = sql.slice(start).match(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/);
  if (!tagMatch) return null;
  const tag = tagMatch[0];
  const bodyStart = start + tagMatch.index + tag.length;
  const close = sql.indexOf(tag, bodyStart);
  if (close === -1) return null;
  const tail = sql.slice(close + tag.length).match(/^\s*;/);
  if (!tail) return null;
  return sql.slice(start, close + tag.length + tail[0].length);
}

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_.*\.sql$/.test(file))
    .sort();
}

/** Ultima definicao de cada nome na cadeia real de migrations. */
function lastFunctionDefs(names) {
  const last = new Map();
  for (const file of migrationFiles()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const name of names) {
      const block = findCreateFunctionBlock(sql, name);
      if (block) last.set(name, { file, sql: block });
    }
  }
  return last;
}

function readMigration(nameRe) {
  const found = migrationFiles().find((file) => nameRe.test(file));
  assert.ok(found, `nenhuma migration casa ${nameRe} em supabase/migrations`);
  return { file: found, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, found), 'utf8') };
}

function dropManualPriorityGuardMutation(sql) {
  const mutated = sql.replace(
    /create trigger contacts_manual_priority_guard[\s\S]*?execute function public\.prevent_direct_manual_priority_update\(\);/,
    '-- MUTACAO DO TESTE: trigger contacts_manual_priority_guard removido',
  );
  assert.notEqual(mutated, sql, 'mutacao nao removeu o trigger contacts_manual_priority_guard');
  return mutated;
}

before(() => {
  try {
    docker(['rm', '-f', CONTAINER]);
  } catch {
    // inexistente
  }
  docker(['run', '--rm', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=test-only', POSTGRES_IMAGE]);
  waitForPostgres();

  // ---- Fixture: so o que can_edit_contact, a RPC e os helpers tocam ----------
  psql(`
create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $a$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$a$;

create role anon;
create role authenticated;
create role service_role;
grant usage on schema public, auth to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  user_id uuid not null unique,
  role text
);
create table public.user_roles (user_id uuid not null, role text not null);
create table public.agent_visibility_grants (agent_id uuid, can_see_agent_id uuid);
create table public.queue_members (queue_id uuid, profile_id uuid, is_active boolean default true);

create table public.contacts (
  address text, address_number text, ai_priority text, ai_projection_analysis_id uuid,
  ai_projection_updated_at timestamptz, ai_sentiment text, assigned_to uuid,
  avatar_fetch_attempted_at timestamptz, avatar_url text, channel_connection_id uuid,
  channel_type text, city text, company text, consent_status text, contact_type text,
  conversation_status text, conversation_status_changed_at timestamptz,
  created_at timestamptz not null default now(), deleted_at timestamptz, email text,
  group_category text, id uuid primary key, is_lid_legacy boolean not null default false,
  job_title text, latitude double precision, lead_origin text, lead_score integer,
  longitude double precision, name text not null, neighborhood text, nickname text,
  notes text, phone text not null, postal_code text, queue_id uuid, risk_score integer,
  state text, surname text, tags text[], updated_at timestamptz not null default now(),
  whatsapp_connection_id uuid
);
alter table public.contacts enable row level security;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb default '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;

grant select, insert, update, delete on public.contacts to authenticated, service_role;
grant select on public.contacts to anon;

-- dados ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('${U_ADMIN}', 'admin@test'), ('${U_OWNER}', 'owner@test'),
  ('${U_QUEUE}', 'queue@test'), ('${U_OUT}', 'out@test'), ('${U_X}', 'x@test');
insert into public.profiles (id, user_id) values
  ('${P_ADMIN}', '${U_ADMIN}'), ('${P_OWNER}', '${U_OWNER}'),
  ('${P_QUEUE}', '${U_QUEUE}'), ('${P_OUT}', '${U_OUT}'), ('${P_X}', '${U_X}');
insert into public.user_roles (user_id, role) values ('${U_ADMIN}', 'admin');
insert into public.queue_members (queue_id, profile_id, is_active) values ('${Q_ID}', '${P_QUEUE}', true);
insert into public.contacts (id, name, phone, assigned_to, queue_id, deleted_at) values
  ('${C_OWNER}', 'Dono', '+55000000001', '${P_OWNER}', null, null),
  ('${C_QUEUE}', 'Fila', '+55000000002', '${P_X}', '${Q_ID}', null),
  ('${C_OUT}',   'Fora', '+55000000003', '${P_X}', null, null),
  ('${C_DEL}',   'Excluido', '+55000000004', '${P_OWNER}', null, now());
`);

  // ---- Helpers de plataforma: ULTIMA definicao real de cada um ----------------
  const defs = lastFunctionDefs([
    'is_admin_or_supervisor', 'get_profile_id_for_user', 'get_visible_agent_ids',
    'ai_is_canonical_priority',
  ]);
  for (const name of ['is_admin_or_supervisor', 'get_profile_id_for_user',
    'get_visible_agent_ids', 'ai_is_canonical_priority']) {
    assert.ok(defs.has(name), `nenhuma migration define public.${name}`);
  }
  for (const name of ['is_admin_or_supervisor', 'get_profile_id_for_user',
    'get_visible_agent_ids', 'ai_is_canonical_priority']) {
    psql(defs.get(name).sql);
  }

  // ---- can_edit_contact REAL (as duas assinaturas) ---------------------------
  psql(fs.readFileSync(path.join(MIGRATIONS_DIR, '20260929770000_contacts_can_edit_contact_helper.sql'), 'utf8'));
  psql(fs.readFileSync(path.join(MIGRATIONS_DIR, '20260929810000_contacts_can_edit_contact_hoisted_params.sql'), 'utf8'));

  // ---- DDL sob teste: o arquivo REAL da migration ----------------------------
  const mig = readMigration(/^\d{14}_manual_priority\.sql$/);
  const migrationSql = process.env.MANUAL_PRIORITY_MUTATE_DROP_GUARD === '1'
    ? dropManualPriorityGuardMutation(mig.sql)
    : mig.sql;
  psql(migrationSql);

  // sessao sem usuario (claim vazio) para os testes que precisam disso
  psql("select set_config('request.jwt.claim.sub', '', false);");
});

after(() => {
  try {
    docker(['rm', '-f', CONTAINER]);
  } catch {
    // ja removido
  }
});

test('estrutura aplicada pela migration real (colunas, constraint validada, funcoes)', () => {
  const cols = psql(`select string_agg(column_name, ',' order by column_name)
    from information_schema.columns
    where table_schema='public' and table_name='contacts' and column_name like 'manual_priority%';`).trim();
  assert.equal(cols, 'manual_priority,manual_priority_at,manual_priority_by');

  const convalidated = psql(`select convalidated from pg_constraint
    where conname='contacts_manual_priority_canonical';`).trim();
  assert.equal(convalidated, 't', 'constraint canonica ausente ou nao validada');

  assert.equal(psql(`select to_regprocedure('public.set_manual_priority(uuid,text)') is not null;`).trim(), 't');
  assert.equal(psql(`select to_regprocedure('public.effective_priority(public.contacts)') is not null;`).trim(), 't');
  assert.equal(psql(`select to_regprocedure('public.prevent_direct_manual_priority_update()') is not null;`).trim(), 't');
  assert.equal(psql(`select exists (select 1 from pg_trigger where tgname='contacts_manual_priority_guard' and not tgisinternal);`).trim(), 't');
});

test('set_manual_priority e SECURITY DEFINER com search_path fixo; anon sem EXECUTE', () => {
  const secdef = psql(`select prosecdef from pg_proc where proname='set_manual_priority';`).trim();
  assert.equal(secdef, 't');
  const cfg = psql(`select coalesce(array_to_string(proconfig, ','),'') from pg_proc where proname='set_manual_priority';`).trim();
  assert.match(cfg, /search_path=pg_catalog, public/);

  assert.equal(psql(`select has_function_privilege('authenticated','public.set_manual_priority(uuid,text)','execute');`).trim(), 't');
  assert.equal(psql(`select has_function_privilege('anon','public.set_manual_priority(uuid,text)','execute');`).trim(), 'f');
});

test('set_manual_priority reusa o predicado explicito de 5 argumentos das policies', () => {
  const def = psql(`select pg_get_functiondef('public.set_manual_priority(uuid,text)'::regprocedure);`);
  assert.match(def, /v_visible_agent_ids\s+uuid\[\]/);
  assert.match(def, /get_visible_agent_ids\(auth\.uid\(\)\)/);
  assert.match(def, /get_profile_id_for_user\(auth\.uid\(\)\)/);
  assert.match(def, /is_admin_or_supervisor\(auth\.uid\(\)\)/);
  assert.match(def, /can_edit_contact\(c\.assigned_to, c\.queue_id, v_visible_agent_ids, v_profile_id, v_is_admin\)/);
  assert.match(def, /set_config\('app\.set_manual_priority_allowed', 'on', true\)/);
  assert.match(def, /set_config\('app\.set_manual_priority_allowed', '', true\)/);
});

test('guard tambem exige o dono da RPC: set_config direto nao burla UPDATE direto', () => {
  const guard = psql(`select pg_get_functiondef('public.prevent_direct_manual_priority_update()'::regprocedure);`);
  assert.match(guard, /current_user = \(/);
  assert.match(guard, /to_regprocedure\('public\.set_manual_priority\(uuid,text\)'\)/);

  psql(`create policy manual_priority_direct_update_flag_test on public.contacts
    for update to authenticated
    using (id = '${C_OWNER}'::uuid)
    with check (id = '${C_OWNER}'::uuid);`);
  try {
    const before = row(C_OWNER);
    const st = probeSqlstate('authenticated', U_OWNER,
      `perform set_config('app.set_manual_priority_allowed', 'on', true);
       update public.contacts set manual_priority='urgent' where id='${C_OWNER}'`);
    assert.equal(st, '42501');
    assert.deepEqual(row(C_OWNER), before);
  } finally {
    psql(`drop policy if exists manual_priority_direct_update_flag_test on public.contacts;`);
  }
});

test('sem sessao: RPC recusa (insufficient_privilege)', () => {
  const st = probeSqlstate('authenticated', null, `perform public.set_manual_priority('${C_OWNER}', 'high')`);
  assert.equal(st, '42501');
  assert.equal(row(C_OWNER).priority, '<null>');
});

test('anon nao consegue executar a RPC (permission denied)', () => {
  const st = probeSqlstate('anon', null, `perform public.set_manual_priority('${C_OWNER}', 'high')`);
  assert.equal(st, '42501');
});

test('UPDATE direto de manual_priority e recusado mesmo quando a linha tem policy de update', () => {
  psql(`create policy manual_priority_direct_update_test on public.contacts
    for update to authenticated
    using (id = '${C_OWNER}'::uuid)
    with check (id = '${C_OWNER}'::uuid);`);
  try {
    const before = row(C_OWNER);
    const st = probeSqlstate('authenticated', U_OWNER,
      `update public.contacts set manual_priority='urgent' where id='${C_OWNER}'`);
    assert.equal(st, '42501');
    assert.deepEqual(row(C_OWNER), before);
  } finally {
    psql(`drop policy if exists manual_priority_direct_update_test on public.contacts;`);
  }
});

test('authenticated malicioso com ID arbitrario fora do escopo: 42501, sem mutacao e sem auditoria', () => {
  const before = auditCount();
  const st = probeSqlstate('authenticated', U_OUT, `perform public.set_manual_priority('${C_OWNER}', 'urgent')`);
  assert.equal(st, '42501');
  assert.equal(row(C_OWNER).priority, '<null>');
  assert.equal(auditCount(), before, 'tentativa recusada nao pode auditar como alteracao');
});

test('contato atribuido ao usuario: grava prioridade, autor, instante e audita', () => {
  const st = probeSqlstate('authenticated', U_OWNER, `perform public.set_manual_priority('${C_OWNER}', 'urgent')`);
  assert.equal(st, 'OK');
  const r = row(C_OWNER);
  assert.equal(r.priority, 'urgent');
  assert.equal(r.by, U_OWNER);
  assert.equal(r.atSet, true);
  assert.ok(auditCount() >= 1, 'evento nao foi auditado');
  assert.equal(lastAuditPriority(), 'urgent');
});

test('membro da fila do contato tambem pode (mesmo predicado can_edit_contact)', () => {
  const st = probeSqlstate('authenticated', U_QUEUE, `perform public.set_manual_priority('${C_QUEUE}', 'medium')`);
  assert.equal(st, 'OK');
  assert.equal(row(C_QUEUE).priority, 'medium');
});

test('admin tambem pode', () => {
  const st = probeSqlstate('authenticated', U_ADMIN, `perform public.set_manual_priority('${C_OUT}', 'low')`);
  assert.equal(st, 'OK');
  assert.equal(row(C_OUT).priority, 'low');
});

test('valor fora do vocabulario: 22023 e nada muda', () => {
  const before = row(C_OWNER).priority;
  const st = probeSqlstate('authenticated', U_OWNER, `perform public.set_manual_priority('${C_OWNER}', 'P1')`);
  assert.equal(st, '22023');
  assert.equal(row(C_OWNER).priority, before);
});

test('contato excluido: recusa (nao encontrado / sem permissao)', () => {
  const st = probeSqlstate('authenticated', U_OWNER, `perform public.set_manual_priority('${C_DEL}', 'high')`);
  assert.equal(st, '42501');
  assert.equal(row(C_DEL).priority, '<null>');
});

test('limpar com NULL zera prioridade, autor e instante e audita', () => {
  const before = auditCount();
  const st = probeSqlstate('authenticated', U_OWNER, `perform public.set_manual_priority('${C_OWNER}', null)`);
  assert.equal(st, 'OK');
  const r = row(C_OWNER);
  assert.equal(r.priority, '<null>');
  assert.equal(r.by, '<null>');
  assert.equal(r.atSet, false);
  assert.equal(auditCount(), before + 1, 'limpeza nao auditada');
  assert.equal(lastAuditPriority(), '<null>');
});

test('AI reescrevendo ai_priority NAO altera a prioridade manual; effective = manual', () => {
  // equipe define manual
  assert.equal(probeSqlstate('authenticated', U_OWNER, `perform public.set_manual_priority('${C_OWNER}', 'high')`), 'OK');
  // analise da IA grava ai_priority (o que persist_conversation_analysis faz)
  psql(`update public.contacts set ai_priority='low' where id='${C_OWNER}';`);
  const r = row(C_OWNER);
  assert.equal(r.priority, 'high', 'a analise da IA apagou a prioridade manual');
  assert.equal(r.effective, 'high', 'effective_priority ignorou a escolha manual');
});

test('effective_priority = coalesce(manual, ia) em toda a matriz', () => {
  psql(`begin;
select set_config('app.set_manual_priority_allowed','on', true);
update public.contacts set manual_priority='high', ai_priority='low' where id='${C_OUT}';
commit;`);
  assert.equal(row(C_OUT).effective, 'high');
  psql(`begin;
select set_config('app.set_manual_priority_allowed','on', true);
update public.contacts set manual_priority=null, ai_priority='low' where id='${C_OUT}';
commit;`);
  assert.equal(row(C_OUT).effective, 'low');
  psql(`begin;
select set_config('app.set_manual_priority_allowed','on', true);
update public.contacts set manual_priority=null, ai_priority=null where id='${C_OUT}';
commit;`);
  assert.equal(row(C_OUT).effective, '<null>');
});

test('RLS: policies SELECT reais permitem o dono ler e bloqueiam usuario sem vinculo', () => {
  psql(`begin;
select set_config('app.set_manual_priority_allowed', 'on', true);
update public.contacts set manual_priority = 'high', manual_priority_by = '${U_OWNER}', manual_priority_at = now() where id = '${C_OWNER}';
commit;`);

  const ownerCount = psql(`select set_config('request.jwt.claim.sub', '${U_OWNER}', false);
set role authenticated;
select count(*) from public.contacts where id = '${C_OWNER}' and manual_priority = 'high';`).trim().split('\n').pop().trim();
  assert.equal(ownerCount, '1', 'as policies reais precisam deixar o dono ler o contato e as colunas novas');

  const outsiderCount = psql(`select set_config('request.jwt.claim.sub', '${U_OUT}', false);
set role authenticated;
select count(*) from public.contacts where id = '${C_OWNER}';`).trim().split('\n').pop().trim();
  assert.equal(outsiderCount, '0', 'as policies reais precisam bloquear usuario sem vinculo');
});


test('o Rollback do cabecalho roda e desfaz exatamente o que foi criado', () => {
  const mig = readMigration(/^\d{14}_manual_priority\.sql$/);
  const stmts = mig.sql.split('\n')
    .filter((line) => /^-- {3}.+;$/.test(line))
    .map((line) => line.replace(/^-- {3}/, '').trim());
  assert.ok(stmts.length >= 6, 'cabecalho de Rollback sem revokes/drops executaveis');
  assert.ok(stmts.some((stmt) => /drop trigger if exists contacts_manual_priority_guard/.test(stmt)), 'rollback nao remove trigger guard');
  assert.ok(stmts.some((stmt) => /drop function if exists public\.prevent_direct_manual_priority_update/.test(stmt)), 'rollback nao remove funcao trigger guard');
  assert.ok(stmts.some((stmt) => /revoke execute on function public\.set_manual_priority/.test(stmt)), 'rollback nao revoga ACL da RPC');
  assert.ok(stmts.some((stmt) => /revoke execute on function public\.effective_priority/.test(stmt)), 'rollback nao revoga ACL da funcao de leitura');

  psql(stmts.join('\n'));

  assert.equal(psql(`select to_regprocedure('public.set_manual_priority(uuid,text)') is null;`).trim(), 't');
  assert.equal(psql(`select to_regprocedure('public.effective_priority(public.contacts)') is null;`).trim(), 't');
  assert.equal(psql(`select to_regprocedure('public.prevent_direct_manual_priority_update()') is null;`).trim(), 't');
  assert.equal(psql(`select exists (select 1 from pg_trigger where tgname='contacts_manual_priority_guard' and not tgisinternal);`).trim(), 'f');
  assert.equal(psql(`select count(*) from information_schema.columns
    where table_schema='public' and table_name='contacts' and column_name like 'manual_priority%';`).trim(), '0');
  assert.equal(psql(`select count(*) from pg_constraint where conname='contacts_manual_priority_canonical';`).trim(), '0');
});
