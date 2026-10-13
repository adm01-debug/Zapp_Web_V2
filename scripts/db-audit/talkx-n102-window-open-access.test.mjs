// N-102 (fatia "acesso", cartao t_24edcc38) — prova, em Postgres 17 descartavel (docker),
// que public.talkx_campaign_window_open(uuid,timestamptz) deixa de ser executavel por
// `authenticated` e passa a ser executavel apenas por `service_role`.
//
// Como rodar (a partir da raiz do repo):
//   node --test scripts/db-audit/talkx-n102-window-open-access.test.mjs
//
// BLOCO A (vermelho): aplica a BASE real 20261009203548 e prova o furo — `authenticated`
//   TEM EXECUTE e chama a RPC de campanha alheia com sucesso (retorna true).
// BLOCO B (verde): aplica a migration *_talkx_n102_window_fixes.sql e prova que anon e
//   authenticated perderam o EXECUTE (permission denied / 42501) e que service_role continua
//   executando; confere que SECURITY DEFINER + search_path fixo seguem preservados.
// BLOCO C (rollback): extrai as linhas "-- Rollback" da propria migration, executa, confere
//   que a ACL anterior volta, e reaplica (idempotencia).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const DOCKER = resolverExecutavel('docker');
const CONTAINER = `zapp-v2-n102-window-access-${process.pid}`;
const IMAGE = process.env.N102_WINDOW_TEST_POSTGRES_IMAGE || 'postgres:17-alpine';

// A base real cria a funcao e concede EXECUTE a authenticated (o furo).
const BASE_FILE = '20261009203548_talkx_campaigns_send_weekdays_dnd.sql';
const baseSql = readFileSync(join(MIGRATIONS_DIR, BASE_FILE), 'utf8');

// A migration da fatia de acesso: qualquer *_talkx_n102_window_fixes.sql que revogue o
// EXECUTE de `authenticated` na funcao (tolera arquivos irmaos da mesma leva).
const fixFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /_talkx_n102_window_fixes\.sql$/.test(f))
  .filter((f) => /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.talkx_campaign_window_open[^;]*authenticated/is
    .test(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')))
  .sort();
assert.ok(
  fixFiles.length >= 1,
  'nenhuma migration *_talkx_n102_window_fixes.sql restringe o EXECUTE de authenticated em window_open',
);

const CAMPAIGN = '00000000-0000-0000-0000-0000000000c1';

function docker(args, opts = {}) {
  return spawnSync(DOCKER, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
}

/** Roda SQL via stdin; `role` faz SET ROLE antes (papel de aplicacao, nunca superusuario). */
function psql(sql, role) {
  const entrada = role ? `SET ROLE ${role};\n${sql}` : sql;
  return docker(
    ['exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: entrada },
  );
}

function psqlOk(sql, role) {
  const r = psql(sql, role);
  assert.equal(r.status, 0, `psql falhou (role=${role ?? 'postgres'}): ${r.stderr || r.stdout}`);
  return (r.stdout.trim().split('\n').pop() ?? '').trim();
}

function dormir(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const PRE_SQL = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid,
  revision bigint NOT NULL DEFAULT 1,
  schedule_timezone text
);
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb,
  description text
);
CREATE TABLE public.talkx_campaign_events (
  id bigserial PRIMARY KEY,
  campaign_id uuid,
  event_type text,
  payload jsonb
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (user_id uuid, role text);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role IN ('admin','supervisor') AND user_id = _user_id)
$$;
REVOKE ALL ON FUNCTION public.is_admin_or_supervisor(uuid) FROM PUBLIC, anon;
`;

const ACL = (role) => `SELECT has_function_privilege('${role}', 'public.talkx_campaign_window_open(uuid, timestamptz)', 'EXECUTE')`;
const CHAMADA = `SELECT public.talkx_campaign_window_open('${CAMPAIGN}', '2026-10-13 12:00:00+00')`;

let containerOk = false;

before(() => {
  const info = docker(['info']);
  assert.equal(info.status, 0, 'daemon docker inacessivel: a prova em Postgres descartavel nao pode rodar');
  const run = docker(['run', '--rm', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=test_only', IMAGE]);
  assert.equal(run.status, 0, `docker run falhou: ${run.stderr}`);
  containerOk = true;
  let pronto = 0;
  for (let i = 0; i < 90 && pronto < 2; i += 1) {
    if (psql('SELECT 1').status === 0) pronto += 1;
    else { pronto = 0; dormir(1000); }
  }
  assert.ok(pronto >= 2, 'postgres descartavel nao ficou pronto de forma estavel');
  psqlOk(PRE_SQL);
  psqlOk(baseSql); // estado ANTERIOR: a base real, com o furo de acesso
  psqlOk(`INSERT INTO public.talkx_campaigns (id, respect_dnd, send_weekdays) VALUES ('${CAMPAIGN}', false, NULL);`);
});

after(() => {
  if (containerOk) docker(['rm', '-f', CONTAINER]);
});

test('BLOCO A (vermelho): com so a base, authenticated executa a RPC de campanha alheia', () => {
  assert.equal(psqlOk(ACL('authenticated')), 't', 'a base deveria conceder EXECUTE a authenticated');
  assert.equal(psqlOk(ACL('anon')), 'f', 'a base ja revogava EXECUTE de anon');
  const r = psql(CHAMADA, 'authenticated');
  assert.equal(r.status, 0, `authenticated deveria executar a RPC na base: ${r.stderr}`);
  assert.equal((r.stdout.trim().split('\n').pop() ?? '').trim(), 't', 'a RPC deveria responder true (fora do DND)');
});

test('BLOCO B (verde): a migration tira o EXECUTE de authenticated e mantem so service_role', () => {
  for (const f of fixFiles) psqlOk(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
  assert.equal(psqlOk(ACL('anon')), 'f');
  assert.equal(psqlOk(ACL('authenticated')), 'f', 'authenticated nao pode ter EXECUTE');
  assert.equal(psqlOk(ACL('service_role')), 't', 'service_role precisa manter EXECUTE');
  // caminho NEGADO: authenticated recebe permission denied (42501)
  const negado = psql(CHAMADA, 'authenticated');
  assert.notEqual(negado.status, 0, 'authenticated nao pode executar a RPC depois da correcao');
  assert.match(negado.stderr, /permission denied for function/i, `esperado permission denied, veio: ${negado.stderr}`);
  // caminho PERMITIDO: service_role executa
  assert.equal(psqlOk(CHAMADA, 'service_role'), 't');
  // SECURITY DEFINER + search_path fixo preservados
  const cfg = psqlOk(
    `SELECT p.prosecdef || '|' || array_to_string(p.proconfig, ',') FROM pg_proc p `
    + `JOIN pg_namespace n ON n.oid = p.pronamespace `
    + `WHERE n.nspname = 'public' AND p.proname = 'talkx_campaign_window_open'`,
  );
  assert.equal(cfg, 'true|search_path=public, pg_temp');
});

test('BLOCO C (rollback): as linhas -- Rollback restauram a ACL anterior, e reaplicar e idempotente', () => {
  const fix = readFileSync(join(MIGRATIONS_DIR, fixFiles[0]), 'utf8');
  const rollback = fix.split('\n')
    .filter((l) => /^--\s{3}(REVOKE|GRANT)\b/.test(l))
    .map((l) => l.replace(/^--\s+/, ''))
    .join('\n');
  assert.ok(rollback.length > 0, 'bloco "-- Rollback" executavel nao encontrado na migration');
  psqlOk(rollback);
  assert.equal(psqlOk(ACL('authenticated')), 't', 'o rollback deve restaurar EXECUTE para authenticated');
  assert.equal(psqlOk(ACL('service_role')), 'f', 'o rollback deve tirar EXECUTE de service_role');
  psqlOk(fix); // reaplica: idempotencia
  assert.equal(psqlOk(ACL('authenticated')), 'f');
  assert.equal(psqlOk(ACL('service_role')), 't');
});
