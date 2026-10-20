/**
 * R2-SLA-004: prova, num PostgreSQL 17 descartavel, que o marco de medicao do
 * SLA (first_response_at) usa o instante em que a mensagem do atendente
 * EFETIVAMENTE saiu (status_updated_at), e nao o instante em que ela foi criada
 * (created_at).
 *
 * Antes da correcao o trigger passa NEW.created_at como p_responded_at: uma
 * mensagem criada aos 4 min e confirmada 'sent' aos 10 min entra no SLA como
 * resposta aos 4 min e NAO estoura o prazo de 5 min — este teste fica VERMELHO.
 * Depois, o mesmo cenario registra 10 min e marca first_response_breached=true
 * — VERDE.
 *
 * As definicoes das funcoes sao extraidas de supabase/migrations/*.sql (a
 * ULTIMA versao de cada nome, em ordem de versao) — nada de copiar SQL para o
 * teste nem de conferir texto solto.
 *
 * Roda com: node --test scripts/db-audit/sla-first-response-delivery-contract.test.mjs
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
const CONTAINER = `zapp-v2-sla-delivery-test-${process.pid}`;

const T = '2026-10-06 12:00:00+00';

// funcoes cujo contrato este teste prova (a ultima definicao de cada uma nas
// migrations e a que vai para o banco); a ordem de aplicacao importa.
const RESOLVER_FN = 'resolve_applicable_first_response_minutes';
const REGISTER_FN = 'register_first_response_internal';
const TRIGGER_FN = 'messages_sla_first_response_trigger';

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

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{14}_.*\.sql$/.test(file))
    .sort();
}

/**
 * Percorre as migrations em ordem de versao e devolve a ultima definicao de
 * cada nome pedido (como o banco fica depois de aplicar a cadeia inteira).
 */
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

function lastDefiningFile(name) {
  const needle = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`,
    'i',
  );
  let found = null;
  for (const file of migrationFiles()) {
    if (needle.test(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))) found = file;
  }
  return found;
}

/** Ultima migration cujo texto casa `pattern` (ex.: o DDL do CREATE TRIGGER). */
function lastFileMatching(pattern) {
  let found = null;
  for (const file of migrationFiles()) {
    if (pattern.test(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))) found = file;
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

  // Fixture minima: so o que as funcoes, o trigger e o indice unico parcial tocam.
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

  // Aplica a ULTIMA definicao de cada nome (resolvedor antes do registro, que
  // antes do trigger que o chama).
  const defs = lastFunctionDefs([RESOLVER_FN, REGISTER_FN, TRIGGER_FN]);
  assert.ok(defs.has(REGISTER_FN), `nenhuma migration define public.${REGISTER_FN}`);
  assert.ok(defs.has(TRIGGER_FN), `nenhuma migration define public.${TRIGGER_FN}`);
  for (const name of [RESOLVER_FN, REGISTER_FN, TRIGGER_FN]) {
    if (defs.has(name)) psql(defs.get(name).sql);
  }

  // O trigger em si so existe na migration; o DDL e estrutural e o comportamento
  // sob teste e o da funcao acima.
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

function probe(label, contactId) {
  return `
SELECT '${label}_at', to_char(first_response_at, 'YYYY-MM-DD HH24:MI:SS')
  FROM public.conversation_sla WHERE contact_id = '${contactId}';
SELECT '${label}_breached', first_response_breached::text
  FROM public.conversation_sla WHERE contact_id = '${contactId}';
`;
}

const C_PENDENTE = '11111111-1111-1111-1111-111111111111';
const C_RETENTATIVA = '22222222-2222-2222-2222-222222222222';
const C_DIRETO = '33333333-3333-3333-3333-333333333333';

test('envio pendente confirmado depois usa o instante da confirmacao (created 4min, sent 10min)', () => {
  const rows = runScenario(`
INSERT INTO public.contacts (id) VALUES ('${C_PENDENTE}');
INSERT INTO public.messages (contact_id, sender, status, created_at, status_updated_at) VALUES
  ('${C_PENDENTE}', 'contact', 'delivered', '${T}'::timestamptz, '${T}'::timestamptz),
  ('${C_PENDENTE}', 'agent', 'sending', '${T}'::timestamptz + interval '4 minutes', '${T}'::timestamptz + interval '4 minutes');
UPDATE public.messages SET status = 'sent', status_updated_at = '${T}'::timestamptz + interval '10 minutes'
  WHERE contact_id = '${C_PENDENTE}' AND sender = 'agent';
${probe('pendente', C_PENDENTE)}
  `);
  assert.equal(rows.get('pendente_at'), '2026-10-06 12:10:00',
    'first_response_at deveria ser o instante do envio (12:10), nao o created_at (12:04)');
  assert.equal(rows.get('pendente_breached'), 'true',
    '10 min de fila ate a entrega estoura o prazo padrao de 5 min');
});

test('retentativa apos falha mede o tempo real ate a entrega (created 2min, failed, sent 11min)', () => {
  const rows = runScenario(`
INSERT INTO public.contacts (id) VALUES ('${C_RETENTATIVA}');
INSERT INTO public.messages (contact_id, sender, status, created_at, status_updated_at) VALUES
  ('${C_RETENTATIVA}', 'contact', 'delivered', '${T}'::timestamptz, '${T}'::timestamptz),
  ('${C_RETENTATIVA}', 'agent', 'sending', '${T}'::timestamptz + interval '2 minutes', '${T}'::timestamptz + interval '2 minutes');
UPDATE public.messages SET status = 'failed', status_updated_at = '${T}'::timestamptz + interval '2 minutes'
  WHERE contact_id = '${C_RETENTATIVA}' AND sender = 'agent';
UPDATE public.messages SET status = 'sending', status_updated_at = '${T}'::timestamptz + interval '2 minutes'
  WHERE contact_id = '${C_RETENTATIVA}' AND sender = 'agent';
UPDATE public.messages SET status = 'sent', status_updated_at = '${T}'::timestamptz + interval '11 minutes'
  WHERE contact_id = '${C_RETENTATIVA}' AND sender = 'agent';
${probe('retentativa', C_RETENTATIVA)}
  `);
  assert.equal(rows.get('retentativa_at'), '2026-10-06 12:11:00',
    'a retentativa deveria registrar 11 min (envio efetivo), nao os 2 min da criacao');
  assert.equal(rows.get('retentativa_breached'), 'true',
    'criacao seguida de falha e retentativa ate 11 min estoura o prazo');
});

test('resposta dentro do prazo continua dentro do prazo (created 1min, sent 3min)', () => {
  const rows = runScenario(`
INSERT INTO public.contacts (id) VALUES ('${C_DIRETO}');
INSERT INTO public.messages (contact_id, sender, status, created_at, status_updated_at) VALUES
  ('${C_DIRETO}', 'contact', 'delivered', '${T}'::timestamptz, '${T}'::timestamptz),
  ('${C_DIRETO}', 'agent', 'sent', '${T}'::timestamptz + interval '1 minute', '${T}'::timestamptz + interval '3 minutes');
${probe('direto', C_DIRETO)}
  `);
  assert.equal(rows.get('direto_at'), '2026-10-06 12:03:00',
    'o marco deveria ser o instante do envio (12:03), dentro do prazo de 5 min');
  assert.equal(rows.get('direto_breached'), 'false',
    '3 min ate a entrega nao estoura o prazo padrao de 5 min');
});

test('migration que define o trigger conserva o contrato (estatico)', () => {
  const file = lastDefiningFile(TRIGGER_FN);
  assert.ok(file, `nenhuma migration define public.${TRIGGER_FN}`);
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const block = findCreateFunctionBlock(sql, TRIGGER_FN);
  assert.ok(block, `${file} nao expoe o bloco de public.${TRIGGER_FN}`);

  // o defeito: o instante da resposta nao pode ser o created_at da mensagem
  assert.doesNotMatch(block, /register_first_response_internal\(\s*NEW\.contact_id\s*,\s*NEW\.created_at/i,
    `${file} ainda passa NEW.created_at como instante da resposta`);
  // o que nao pode regredir
  assert.match(block, /status_updated_at/i,
    `${file} nao usa o instante em que o status mudou (status_updated_at)`);
  assert.match(block, /SECURITY DEFINER/i, `${file} perdeu SECURITY DEFINER`);
  assert.match(block, /SET\s+search_path\s*=\s*public/i,
    `${file} perdeu SET search_path = public`);

  // o DDL do trigger mora na migration que o cria (nao na que recria a funcao):
  // ele continua so disparando para mensagem do atendente que virou 'sent'.
  const triggerFile = lastFileMatching(/CREATE\s+TRIGGER\s+trg_messages_sla_first_response/i);
  assert.ok(triggerFile, 'nenhuma migration cria o trg_messages_sla_first_response');
  const triggerSql = fs.readFileSync(path.join(MIGRATIONS_DIR, triggerFile), 'utf8');
  assert.match(triggerSql, /AFTER\s+INSERT\s+OR\s+UPDATE\s+OF\s+status\s+ON\s+public\.messages/i,
    `${triggerFile} perdeu o disparo em INSERT/UPDATE OF status`);
  assert.match(triggerSql, /WHEN\s*\(NEW\.contact_id IS NOT NULL[\s\S]*NEW\.status = 'sent'\)/i,
    `${triggerFile} perdeu a condicao do trigger (mensagem do atendente com status sent)`);
});
