/**
 * R2-SLA-003: prova, num PostgreSQL 17 descartavel, que
 * register_first_response_internal classifica first_response_breached contra o
 * prazo granular aplicavel ao contato — a MESMA precedencia da UI
 * (resolveHierarchy em src/hooks/sla/useApplicableSLA.ts):
 *   contact > company > job_title > contact_type > queue > agent,
 *   fallback sla_configurations (is_active + is_default) e, por fim, 5 min.
 *
 * Antes da migration de prazo granular o caso "regra de 2 min + resposta aos
 * 3 min" sai classificado como dentro do prazo (intervalo fixo de 5 min) —
 * este teste fica VERMELHO. Depois, VERDE.
 *
 * As definicoes das funcoes sao extraidas de supabase/migrations/*.sql (a
 * ULTIMA versao de cada nome, em ordem de versao) — nada de copiar SQL para o
 * teste nem de so conferir texto.
 *
 * Roda com: node --test scripts/db-audit/sla-granular-contract.test.mjs
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
const CONTAINER = `zapp-v2-sla-granular-test-${process.pid}`;

const T = '2026-10-05 12:00:00+00';

// nomes das funcoes cujo contrato este teste prova (a ultima definicao de cada
// uma nas migrations e a que vai para o banco)
const RESOLVER_FN = 'resolve_applicable_first_response_minutes';
const REGISTER_FN = 'register_first_response_internal';

function docker(args, input) {
  return execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
        // servidor final ainda nao aceita conexao; tenta de novo
      }
    }
    sleepMs(1000);
  }
  throw new Error('PostgreSQL de teste nao ficou pronto em 60 segundos.');
}

/**
 * Captura o bloco `CREATE [OR REPLACE] FUNCTION public.<nome>(...) $<tag>$...
 * $<tag>$;` MAIS RECENTE do arquivo. O primeiro dollar-quote apos o cabecalho e
 * o corpo da funcao (o cabecalho nao contem dollar-quote).
 */
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

/**
 * Percorre as migrations em ordem de versao e devolve a ultima definicao de
 * cada nome pedido (como o banco fica depois de aplicar a cadeia inteira).
 */
function lastFunctionDefs(names) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_.*\.sql$/.test(file))
    .sort();
  const last = new Map();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const name of names) {
      const block = findCreateFunctionBlock(sql, name);
      if (block) last.set(name, { file, sql: block });
    }
  }
  return last;
}

function lastDefiningFile(name) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_.*\.sql$/.test(file))
    .sort();
  const needle = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,
    'i',
  );
  let found = null;
  for (const file of files) {
    if (needle.test(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))) {
      found = file;
    }
  }
  return found;
}

before(() => {
  try {
    docker(['rm', '-f', CONTAINER]); // limpa resto de uma execucao anterior, se houver
  } catch {
    // container inexistente
  }
  docker(['run', '--rm', '-d', '--name', CONTAINER,
    '-e', 'POSTGRES_PASSWORD=test-only', POSTGRES_IMAGE]);
  waitForPostgres();

  // Fixture minima: so o que as funcoes e o indice unico parcial tocam.
  psql(`
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
  created_at timestamptz NOT NULL
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
  is_active boolean DEFAULT true
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

  // Aplica a ULTIMA definicao de cada nome (resolvedor antes do registro).
  const defs = lastFunctionDefs([RESOLVER_FN, REGISTER_FN]);
  assert.ok(defs.has(REGISTER_FN),
    `nenhuma migration define public.${REGISTER_FN}`);
  for (const name of [RESOLVER_FN, REGISTER_FN]) {
    if (defs.has(name)) psql(defs.get(name).sql);
  }
});

after(() => {
  try {
    docker(['rm', '-f', CONTAINER]);
  } catch {
    // container ja removido
  }
});

/**
 * Roda um cenario inteiro numa UNICA transacao (BEGIN...ROLLBACK): os SELECTs
 * rotulados imprimem "rotulo|valor" e nada sobra no banco.
 */
function runScenario(sql) {
  const out = psql(`BEGIN;\n${sql}\nROLLBACK;\n`);
  const rows = new Map();
  for (const line of out.split('\n')) {
    const idx = line.indexOf('|');
    if (idx > 0) rows.set(line.slice(0, idx), line.slice(idx + 1));
  }
  return rows;
}

function registerCall(contactId, respondedAtExpr) {
  return `SELECT public.${REGISTER_FN}('${contactId}', ${respondedAtExpr}, ${respondedAtExpr});`;
}

function breachProbe(label, contactId) {
  return `SELECT '${label}', first_response_breached FROM public.conversation_sla WHERE contact_id = '${contactId}';`;
}

test('regra ATIVA de 2 min (nivel contact) classifica resposta aos 3 min como breach', () => {
  const contact = '11111111-1111-1111-1111-111111111111';
  const rows = runScenario(`
INSERT INTO public.contacts (id) VALUES ('${contact}');
INSERT INTO public.sla_rules (name, first_response_minutes, contact_id, priority)
  VALUES ('vip-2min', 2, '${contact}', 10);
INSERT INTO public.messages (contact_id, sender, status, created_at) VALUES
  ('${contact}', 'contact', 'delivered', '${T}'::timestamptz),
  ('${contact}', 'agent', 'sent', '${T}'::timestamptz + interval '3 minutes');
${registerCall(contact, `'${T}'::timestamptz + interval '3 minutes'`)}
${breachProbe('caso_2min_3min', contact)}
  `);
  assert.equal(rows.get('caso_2min_3min'), 't',
    'regra de 2 min + resposta aos 3 min deveria marcar first_response_breached=true');
});

test('sem regra nem configuracao: padrao do sistema (5 min) segue valendo', () => {
  const c3min = '22222222-2222-2222-2222-222222222222';
  const c6min = '33333333-3333-3333-3333-333333333333';
  const rows = runScenario(`
INSERT INTO public.contacts (id) VALUES ('${c3min}'), ('${c6min}');
INSERT INTO public.messages (contact_id, sender, status, created_at) VALUES
  ('${c3min}', 'contact', 'delivered', '${T}'::timestamptz),
  ('${c6min}', 'contact', 'delivered', '${T}'::timestamptz);
${registerCall(c3min, `'${T}'::timestamptz + interval '3 minutes'`)}
${breachProbe('fallback_3min', c3min)}
${registerCall(c6min, `'${T}'::timestamptz + interval '6 minutes'`)}
${breachProbe('fallback_6min', c6min)}
  `);
  assert.equal(rows.get('fallback_3min'), 'f', '3 min com padrao de 5 min nao e breach');
  assert.equal(rows.get('fallback_6min'), 't', '6 min com padrao de 5 min e breach');
});

test('fallback intermediario: sla_configurations is_default aplica antes do padrao de 5 min', () => {
  const c6min = '44444444-4444-4444-4444-444444444444';
  const c11min = '55555555-5555-5555-5555-555555555555';
  const rows = runScenario(`
INSERT INTO public.sla_configurations (name, first_response_minutes, is_active, is_default)
  VALUES ('global-10min', 10, true, true);
INSERT INTO public.contacts (id) VALUES ('${c6min}'), ('${c11min}');
INSERT INTO public.messages (contact_id, sender, status, created_at) VALUES
  ('${c6min}', 'contact', 'delivered', '${T}'::timestamptz),
  ('${c11min}', 'contact', 'delivered', '${T}'::timestamptz);
${registerCall(c6min, `'${T}'::timestamptz + interval '6 minutes'`)}
${breachProbe('config_6min', c6min)}
${registerCall(c11min, `'${T}'::timestamptz + interval '11 minutes'`)}
${breachProbe('config_11min', c11min)}
  `);
  assert.equal(rows.get('config_6min'), 'f', '6 min com configuracao default de 10 min nao e breach');
  assert.equal(rows.get('config_11min'), 't', '11 min com configuracao default de 10 min e breach');
});

test('precedencia: contact vence company e queue; company vence queue', () => {
  const queue = '66666666-6666-6666-6666-666666666666';
  const cContact = '77777777-7777-7777-7777-777777777777';
  const cCompany = '88888888-8888-8888-8888-888888888888';
  const rows = runScenario(`
INSERT INTO public.contacts (id, company, queue_id) VALUES
  ('${cContact}', 'Beta', '${queue}'),
  ('${cCompany}', 'Beta', '${queue}');
INSERT INTO public.sla_rules (name, first_response_minutes, contact_id, company, queue_id, priority) VALUES
  ('regra-contact-2min', 2, '${cContact}', NULL, NULL, 5),
  ('regra-company-30min', 30, NULL, 'Beta', NULL, 100),
  ('regra-queue-45min', 45, NULL, NULL, '${queue}', 200);
INSERT INTO public.messages (contact_id, sender, status, created_at) VALUES
  ('${cContact}', 'contact', 'delivered', '${T}'::timestamptz),
  ('${cCompany}', 'contact', 'delivered', '${T}'::timestamptz);
${registerCall(cContact, `'${T}'::timestamptz + interval '3 minutes'`)}
${breachProbe('contact_vence', cContact)}
${registerCall(cCompany, `'${T}'::timestamptz + interval '3 minutes'`)}
${breachProbe('company_vence', cCompany)}
  `);
  // contact (2 min) vence mesmo com regras de prioridade numerica maior abaixo
  assert.equal(rows.get('contact_vence'), 't',
    'regra contact de 2 min deveria vencer company/queue e marcar breach aos 3 min');
  // company (30 min) vence queue (45 min): 3 min fica dentro do prazo
  assert.equal(rows.get('company_vence'), 'f',
    'regra company de 30 min deveria vencer queue; 3 min nao e breach');
});

test('migration que define o registro conserva o contrato (estatico)', () => {
  const file = lastDefiningFile(REGISTER_FN);
  assert.ok(file, `nenhuma migration define public.${REGISTER_FN}`);
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

  // a definicao vigente resolve o prazo granular (nada de intervalo fixo de 5 min)
  assert.match(sql, new RegExp(`public\\.${RESOLVER_FN}\\s*\\(`),
    `${file} nao usa o resolvedor granular de prazo`);

  // o que nao pode regredir
  assert.match(sql, /SECURITY DEFINER/i, `${file} perdeu SECURITY DEFINER`);
  assert.match(sql, /SET\s+search_path\s*=\s*public/i,
    `${file} perdeu SET search_path = public`);
  assert.match(sql, /pg_advisory_xact_lock\(\s*hashtextextended\(\s*p_contact_id::text\s*,\s*42\s*\)\s*\)/i,
    `${file} perdeu o advisory lock por contato`);
  assert.match(sql, /status\s+IN\s*\(\s*'sent'\s*,\s*'delivered'\s*,\s*'read'\s*\)/i,
    `${file} perdeu o filtro de status validos do atendente`);
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.register_first_response_internal\(uuid,\s*timestamptz,\s*timestamptz\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    `${file} perdeu o REVOKE do registro interno`);
  assert.match(sql, new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${RESOLVER_FN}\\(uuid\\)\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated`, 'i'),
    `${file} perdeu o REVOKE do resolvedor granular`);
});

/**
 * R2-SLA-003 (rollback): extrai o bloco executavel do cabecalho
 * `-- Rollback (SQL executavel, na ordem):` — linhas `--   <stmt>;` — do
 * proprio arquivo da migration (nada de reescrever o SQL no teste).
 */
function rollbackBlock(file) {
  const lines = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').split(/\r?\n/);
  const out = [];
  let started = false;
  for (const line of lines) {
    if (!started) {
      if (/^--\s*Rollback \(SQL execut/.test(line)) started = true;
      continue;
    }
    const stmt = line.match(/^--\s{3}(\S.*)$/);
    if (!stmt) break;
    out.push(stmt[1]);
  }
  return out.join('\n');
}

const GRANULAR_MIGRATION = '20261005151753_sla_first_response_granular.sql';
const ROLLBACK_CONTACT = '99999999-9999-9999-9999-999999999999';

/** Monta o cenario 2min/3min do contato de prova (sem tocar o banco fora da transacao). */
function granularProbe() {
  return runScenario(`
INSERT INTO public.contacts (id) VALUES ('${ROLLBACK_CONTACT}');
INSERT INTO public.sla_rules (name, first_response_minutes, contact_id, priority)
  VALUES ('rollback-vip-2min', 2, '${ROLLBACK_CONTACT}', 10);
INSERT INTO public.messages (contact_id, sender, status, created_at) VALUES
  ('${ROLLBACK_CONTACT}', 'contact', 'delivered', '${T}'::timestamptz),
  ('${ROLLBACK_CONTACT}', 'agent', 'sent', '${T}'::timestamptz + interval '3 minutes');
${registerCall(ROLLBACK_CONTACT, `'${T}'::timestamptz + interval '3 minutes'`)}
${breachProbe('rollback_2min_3min', ROLLBACK_CONTACT)}
  `).get('rollback_2min_3min');
}

test('rollback da migration devolve o prazo fixo anterior e a migration reaplica (executado)', () => {
  const rb = rollbackBlock(GRANULAR_MIGRATION);
  assert.ok(rb.length > 0, `${GRANULAR_MIGRATION} nao tem bloco -- Rollback (SQL executavel, na ordem)`);
  assert.match(rb, /create or replace function public\.register_first_response_internal/i,
    'o rollback nao devolve register_first_response_internal');
  assert.match(rb, /drop function if exists public\.resolve_applicable_first_response_minutes\(uuid\)/i,
    'o rollback nao dropa o resolvedor granular');

  // estado corrigido: 2 min + resposta aos 3 min = breach
  assert.equal(granularProbe(), 't', 'com a migration aplicada o caso 2min/3min deveria ser breach');

  // papeis do Supabase exigidos pelo REVOKE do cabecalho (o container cru nao os tem)
  psql(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;`);

  // executa o rollback de verdade, do proprio arquivo
  psql(rb);

  assert.equal(
    psql(`SELECT count(*) FROM pg_proc WHERE proname = '${RESOLVER_FN}';`).trim(), '0',
    'o rollback deveria remover o resolvedor granular do banco',
  );
  assert.equal(granularProbe(), 'f',
    'depois do rollback o registro deveria voltar ao intervalo fixo de 5 min (2min/3min deixa de ser breach)');

  // reaplica a migration inteira: idempotente, volta ao contrato corrigido
  psql(fs.readFileSync(path.join(MIGRATIONS_DIR, GRANULAR_MIGRATION), 'utf8'));
  assert.equal(
    psql(`SELECT count(*) FROM pg_proc WHERE proname = '${RESOLVER_FN}';`).trim(), '1',
    'a reaplicacao deveria recriar o resolvedor granular',
  );
  assert.equal(granularProbe(), 't', 'a reaplicacao deveria voltar a marcar breach no caso 2min/3min');
});
