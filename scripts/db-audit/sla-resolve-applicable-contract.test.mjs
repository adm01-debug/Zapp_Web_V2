/**
 * PB-39 (paridade V2/V3): prova, num PostgreSQL 17 descartavel, que o BANCO
 * resolve o prazo de 1a resposta — resolve_applicable_sla — na MESMA hierarquia
 * do cliente (contato > empresa > cargo > tipo > fila > agente >
 * sla_configurations.is_default > 5 min) e que register_first_response_internal
 * passa a usar esse prazo, no lugar do `interval '5 minutes'` fixo.
 *
 * Antes da migration a funcao resolve_applicable_sla nao existe: o caso de 30
 * min com resposta aos 10 min estoura o padrao de 5 min (first_response_breached
 * = true) e a RPC nao existe — o teste fica VERMELHO. Depois: o prazo de 30 min
 * vale e 10 min NAO estoura — VERDE.
 *
 * Além do ramo de comportamento, prova por papel REAL (anon/authenticated/
 * service_role): EXECUTE fechado para anon, aberto para authenticated e
 * service_role; visibilidade — quem nao ve o contato recebe 42501. E EXECUTA o
 * rollback do proprio cabecalho da migration, conferindo que o prazo fixo volta
 * e a funcao nova some; depois reaplica (idempotencia).
 *
 * As definicoes das funcoes sao extraidas de supabase/migrations/*.sql (a ULTIMA
 * versao de cada nome) — nada de copiar SQL para o teste.
 *
 * Roda com: node --test scripts/db-audit/sla-resolve-applicable-contract.test.mjs
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
const CONTAINER = `zapp-v2-sla-resolve-test-${process.pid}`;
const MIGRATION_FILE = '20261013012747_sla_resolve_applicable.sql';

const T = '2026-10-12 12:00:00+00';

const RESOLVER_FN = 'resolve_applicable_sla';
const REGISTER_FN = 'register_first_response_internal';
const TRIGGER_FN = 'messages_sla_first_response_trigger';
const DEPS = ['is_admin_or_supervisor', 'get_profile_id_for_user', 'get_visible_agent_ids', 'is_contact_visible_to_user'];

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
        // servidor final ainda nao aceita conexao
      }
    }
    sleepMs(1000);
  }
  throw new Error('PostgreSQL de teste nao ficou pronto em 60 segundos.');
}

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

/** Ultima definicao de cada nome pedido (como o banco fica depois da cadeia). */
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

function migrationSql() {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8');
}

/** REVOKE/GRANT da RPC nova, tomados do proprio arquivo (nada reescrito a mao). */
function resolverAcl() {
  const sql = migrationSql();
  const stmts = sql.match(/^[ \t]*(?:REVOKE|GRANT)\b[\s\S]*?;/gim) || [];
  return stmts.filter((s) => /resolve_applicable_sla/i.test(s)).join('\n');
}

/** Bloco "-- Rollback (SQL executável, na ordem):" -> SQL, na ordem escrita. */
function rollbackSql() {
  const lines = migrationSql().split('\n');
  const start = lines.findIndex((l) => /^--\s*Rollback \(SQL execut/i.test(l));
  assert.notEqual(start, -1, 'migration sem bloco de rollback executavel');
  const stmts = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^--\s{3}(.*\S)\s*$/);
    if (!m) break;
    stmts.push(m[1]);
  }
  assert.ok(stmts.length >= 3, 'bloco de rollback executavel tem poucos statements');
  return stmts.join('\n');
}

before(() => {
  try {
    docker(['rm', '-f', CONTAINER]);
  } catch {
    // container inexistente
  }
  docker(['run', '--rm', '-d', '--name', CONTAINER,
    '-e', 'POSTGRES_PASSWORD=test-only', POSTGRES_IMAGE]);
  waitForPostgres();

  psql(`
-- papeis reais (sem BYPASSRLS), como em producao
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;
-- auth.uid() real le o JWT; para o teste, o "usuario da sessao" vem de um GUC.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent');

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL);
CREATE TABLE public.agent_visibility_grants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL, can_see_agent_id uuid NOT NULL);
CREATE TABLE public.queue_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), queue_id uuid NOT NULL, profile_id uuid NOT NULL, is_active boolean DEFAULT true);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  company text,
  job_title text,
  contact_type text,
  queue_id uuid,
  assigned_to uuid
);
CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id uuid,
  sender text,
  status text,
  created_at timestamptz NOT NULL,
  status_updated_at timestamptz
);
CREATE TABLE public.sla_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  first_response_minutes integer NOT NULL DEFAULT 5,
  resolution_minutes integer NOT NULL DEFAULT 60,
  priority integer NOT NULL DEFAULT 0,
  contact_id uuid,
  company text,
  job_title text,
  contact_type text,
  queue_id uuid,
  agent_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sla_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  first_response_minutes integer NOT NULL DEFAULT 5,
  resolution_minutes integer NOT NULL DEFAULT 60,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sla_configuration_id uuid,
  first_message_at timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  first_response_breached boolean DEFAULT false,
  resolution_breached boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_conversation_sla_open_per_contact
  ON public.conversation_sla (contact_id) WHERE first_response_at IS NULL;
  `);

  // Aplica as dependencias reais (extraidas das migrations) e a RPC nova.
  const names = [RESOLVER_FN, REGISTER_FN, TRIGGER_FN, ...DEPS];
  const defs = lastFunctionDefs(names);
  for (const name of names) {
    assert.ok(defs.has(name), `nenhuma migration define public.${name}`);
  }
  for (const name of [...DEPS, RESOLVER_FN, REGISTER_FN, TRIGGER_FN]) {
    psql(defs.get(name).sql);
  }
  psql(resolverAcl());

  psql(`
DROP TRIGGER IF EXISTS trg_messages_sla_first_response ON public.messages;
CREATE TRIGGER trg_messages_sla_first_response
  AFTER INSERT OR UPDATE OF status ON public.messages
  FOR EACH ROW
  WHEN (NEW.contact_id IS NOT NULL
        AND NEW.sender = 'agent'
        AND NEW.status = 'sent')
  EXECUTE FUNCTION public.messages_sla_first_response_trigger();
  `);
});

after(() => {
  try {
    docker(['rm', '-f', CONTAINER]);
  } catch {
    // ja removido
  }
});

/** Roda o cenario numa transacao que sempre volta (BEGIN...ROLLBACK). */
function runScenario(sql) {
  const out = psql(`BEGIN;\n${sql}\nROLLBACK;\n`);
  const rows = new Map();
  for (const line of out.split('\n')) {
    const idx = line.indexOf('|');
    if (idx > 0) rows.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return rows;
}

const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';
const Q1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const A1 = 'bbbbbbbb-0000-0000-0000-000000000001';

function ruleInsert(name, minutes, level, extra = '') {
  const cols = { contact: 'contact_id', company: 'company', job_title: 'job_title', contact_type: 'contact_type', queue: 'queue_id', agent: 'agent_id' };
  const value = { contact: `'${C1}'`, company: `'ACME'`, job_title: `'Diretor'`, contact_type: `'lead'`, queue: `'${Q1}'`, agent: `'${A1}'` }[level];
  return `INSERT INTO public.sla_rules (name, first_response_minutes, priority, ${cols[level]}) VALUES ('${name}', ${minutes}, 0, ${value}) ${extra};`;
}

function resolveProbe(label) {
  return `
SELECT '${label}_min', first_response_minutes::text FROM public.resolve_applicable_sla('${C1}');
SELECT '${label}_lvl', matched_level FROM public.resolve_applicable_sla('${C1}');
SELECT '${label}_name', rule_name FROM public.resolve_applicable_sla('${C1}');
SELECT '${label}_id_set', (rule_id IS NOT NULL)::text FROM public.resolve_applicable_sla('${C1}');
`;
}

test('hierarquia: fila > agente, e cada nivel mais especifico vence o anterior', () => {
  const rows = runScenario(`
INSERT INTO public.contacts (id, company, job_title, contact_type, queue_id, assigned_to)
  VALUES ('${C1}', 'ACME', 'Diretor', 'lead', '${Q1}', '${A1}');
${ruleInsert('fila-30', 30, 'queue')}
${ruleInsert('agente-50', 50, 'agent')}
${resolveProbe('so_fila')}
${ruleInsert('tipo-70', 70, 'contact_type')}
${resolveProbe('mais_tipo')}
${ruleInsert('cargo-90', 90, 'job_title')}
${resolveProbe('mais_cargo')}
${ruleInsert('empresa-110', 110, 'company')}
${resolveProbe('mais_empresa')}
${ruleInsert('contato-130', 130, 'contact')}
${resolveProbe('mais_contato')}
  `);
  assert.equal(rows.get('so_fila_lvl'), 'queue', 'fila vence o agente');
  assert.equal(rows.get('so_fila_min'), '30');
  assert.equal(rows.get('so_fila_name'), 'fila-30');
  assert.equal(rows.get('mais_tipo_lvl'), 'contact_type');
  assert.equal(rows.get('mais_cargo_lvl'), 'job_title');
  assert.equal(rows.get('mais_empresa_lvl'), 'company');
  assert.equal(rows.get('mais_contato_lvl'), 'contact');
  assert.equal(rows.get('mais_contato_min'), '130');
  assert.equal(rows.get('mais_contato_id_set'), 'true', 'regra casada devolve o id');
});

test('empate no nivel: priority DESC decide; regra inativa e nivel que nao casa sao ignorados', () => {
  const rows = runScenario(`
INSERT INTO public.contacts (id, company, job_title, contact_type, queue_id, assigned_to)
  VALUES ('${C1}', 'ACME', 'Diretor', 'lead', '${Q1}', '${A1}');
INSERT INTO public.sla_rules (name, first_response_minutes, priority, queue_id, company) VALUES
  ('fila-baixa', 30, 1, '${Q1}', NULL),
  ('fila-alta', 45, 9, '${Q1}', NULL),
  ('outra-empresa', 99, 9, '${Q1}', 'OUTRA'),
  ('inativa', 88, 9, '${Q1}', NULL);
UPDATE public.sla_rules SET is_active = false WHERE name = 'inativa';
${resolveProbe('empate')}
  `);
  assert.equal(rows.get('empate_min'), '45', 'priority DESC escolhe a regra de 45 min');
  assert.equal(rows.get('empate_name'), 'fila-alta');
});

test('sem regra: sla_configurations.is_default; sem default: padrao do sistema de 5 min', () => {
  const comDefault = runScenario(`
INSERT INTO public.contacts (id) VALUES ('${C1}');
INSERT INTO public.sla_configurations (name, first_response_minutes, is_default, is_active)
  VALUES ('Padrao da casa', 20, true, true);
${resolveProbe('global')}
  `);
  assert.equal(comDefault.get('global_min'), '20');
  assert.equal(comDefault.get('global_lvl'), 'global_default');
  assert.equal(comDefault.get('global_name'), 'Padrao da casa');
  assert.equal(comDefault.get('global_id_set'), 'false', 'config global nao tem rule_id');

  const semDefault = runScenario(`
INSERT INTO public.contacts (id) VALUES ('${C1}');
INSERT INTO public.sla_configurations (name, first_response_minutes, is_default, is_active)
  VALUES ('Desligada', 20, true, false);
${resolveProbe('sistema')}
  `);
  assert.equal(semDefault.get('sistema_min'), '5');
  assert.equal(semDefault.get('sistema_lvl'), 'system_default');

  const inexistente = runScenario(`SELECT 'sem_contato_min', first_response_minutes::text FROM public.resolve_applicable_sla('${C2}');`);
  assert.equal(inexistente.get('sem_contato_min'), '5', 'contato inexistente (service_role) cai no padrao');
});

test('register_first_response_internal usa o prazo da regra (30 min) — 10 min nao estoura', () => {
  const rows = runScenario(`
INSERT INTO public.contacts (id, queue_id) VALUES ('${C1}', '${Q1}');
INSERT INTO public.sla_rules (name, first_response_minutes, queue_id) VALUES ('fila-30', 30, '${Q1}');
INSERT INTO public.messages (contact_id, sender, status, created_at, status_updated_at) VALUES
  ('${C1}', 'contact', 'delivered', '${T}'::timestamptz, '${T}'::timestamptz),
  ('${C1}', 'agent', 'sent', '${T}'::timestamptz + interval '1 minute', '${T}'::timestamptz + interval '10 minutes');
SELECT 'resp_at', to_char(first_response_at, 'YYYY-MM-DD HH24:MI:SS') FROM public.conversation_sla WHERE contact_id = '${C1}';
SELECT 'breached', first_response_breached::text FROM public.conversation_sla WHERE contact_id = '${C1}';
  `);
  assert.equal(rows.get('resp_at'), '2026-10-12 12:10:00');
  assert.equal(rows.get('breached'), 'false',
    'com a regra de 30 min, 10 min nao estoura (antes da migration o 5 min fixo marcava true)');
});

test('register primeiro responde com o prazo configurado, nao com 5 min fixo (prova direta do defeito)', () => {
  const rows = runScenario(`
INSERT INTO public.contacts (id, queue_id) VALUES ('${C1}', '${Q1}');
INSERT INTO public.sla_rules (name, first_response_minutes, queue_id) VALUES ('fila-3', 3, '${Q1}');
INSERT INTO public.messages (contact_id, sender, status, created_at, status_updated_at) VALUES
  ('${C1}', 'contact', 'delivered', '${T}'::timestamptz, '${T}'::timestamptz),
  ('${C1}', 'agent', 'sent', '${T}'::timestamptz + interval '1 minute', '${T}'::timestamptz + interval '4 minutes');
SELECT 'breached', first_response_breached::text FROM public.conversation_sla WHERE contact_id = '${C1}';
  `);
  assert.equal(rows.get('breached'), 'true', 'com a regra de 3 min, 4 min estoura');
});

test('ACL: anon sem EXECUTE; authenticated e service_role com EXECUTE', () => {
  const rows = runScenario(`
SELECT 'anon', has_function_privilege('anon', 'public.resolve_applicable_sla(uuid)', 'EXECUTE')::text;
SELECT 'authenticated', has_function_privilege('authenticated', 'public.resolve_applicable_sla(uuid)', 'EXECUTE')::text;
SELECT 'service_role', has_function_privilege('service_role', 'public.resolve_applicable_sla(uuid)', 'EXECUTE')::text;
SELECT 'anon_regra_le', has_table_privilege('anon', 'public.sla_rules', 'SELECT')::text;
  `);
  assert.equal(rows.get('anon'), 'false', 'anon nao pode chamar a RPC');
  assert.equal(rows.get('authenticated'), 'true');
  assert.equal(rows.get('service_role'), 'true', 'o job de varredura (service_role) chama a RPC');
  assert.equal(rows.get('anon_regra_le'), 'false', 'nenhum GRANT novo em sla_rules');
});

test('anon chamando a RPC e barrado (permission denied)', () => {
  assert.throws(
    () => psql(`BEGIN; SET LOCAL ROLE anon; SELECT * FROM public.resolve_applicable_sla('${C1}'); ROLLBACK;`),
    /permission denied/i,
    'anon deveria receber permission denied',
  );
});

test('visibilidade: quem ve o contato resolve; quem nao ve recebe 42501', () => {
  const U_ADMIN = 'ffffffff-0000-0000-0000-000000000001';
  const U_FORA = 'ffffffff-0000-0000-0000-000000000002';
  const P_ADMIN = 'eeeeeeee-0000-0000-0000-000000000001';
  const P_FORA = 'eeeeeeee-0000-0000-0000-000000000002';

  const visible = runScenario(`
INSERT INTO public.profiles (id, user_id) VALUES ('${P_ADMIN}', '${U_ADMIN}'), ('${P_FORA}', '${U_FORA}');
INSERT INTO public.user_roles (user_id, role) VALUES ('${U_ADMIN}', 'admin');
INSERT INTO public.contacts (id, queue_id) VALUES ('${C1}', '${Q1}');
SET LOCAL test.uid = '${U_ADMIN}';
SET LOCAL ROLE authenticated;
SELECT 'min', first_response_minutes::text FROM public.resolve_applicable_sla('${C1}');
  `);
  assert.equal(visible.get('min'), '5', 'admin ve o contato e recebe o prazo (padrao 5 min)');

  assert.throws(
    () => psql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL test.uid = '${U_FORA}'; SELECT * FROM public.resolve_applicable_sla('${C1}'); ROLLBACK;`),
    /nao visivel|not visible/i,
    'quem nao ve o contato recebe 42501, nao o resultado',
  );
});

test('rollback do cabecalho: some a RPC nova e o prazo fixo de 5 min volta', () => {
  psql(rollbackSql());

  const voltou = psql(`
SELECT 'rpc_existe', (to_regprocedure('public.resolve_applicable_sla(uuid)') IS NOT NULL)::text;
SELECT 'register_fixo', (pg_get_functiondef('public.register_first_response_internal(uuid,timestamptz,timestamptz)'::regprocedure) LIKE '%interval ''5 minutes''%')::text;
SELECT 'mark_fixo', (pg_get_functiondef('public.mark_first_response(uuid)'::regprocedure) LIKE '%interval ''5 minutes''%')::text;
  `);
  const rows = new Map();
  for (const line of voltou.split('\n')) {
    const idx = line.indexOf('|');
    if (idx > 0) rows.set(line.slice(0, idx), line.slice(idx + 1));
  }
  assert.equal(rows.get('rpc_existe'), 'false', 'o rollback dropa resolve_applicable_sla');
  assert.equal(rows.get('register_fixo'), 'true', 'o rollback devolve o register com o 5 min fixo');
  assert.equal(rows.get('mark_fixo'), 'true', 'o rollback devolve o mark com o 5 min fixo');

  // Reaplica (idempotencia) e confere que a RPC volta.
  const names = [RESOLVER_FN, REGISTER_FN, TRIGGER_FN];
  const defs = lastFunctionDefs(names);
  for (const name of [RESOLVER_FN, REGISTER_FN, TRIGGER_FN]) psql(defs.get(name).sql);
  psql(resolverAcl());
  const deNovo = psql(`SELECT 'rpc_existe', (to_regprocedure('public.resolve_applicable_sla(uuid)') IS NOT NULL)::text;`);
  assert.match(deNovo, /rpc_existe\|true/, 'reaplicar a migration recria a RPC');
});
