// X076 / IA-161 — a trilha de banco da IA do Talk X.
//
// Como rodar (a partir da raiz do repo):
//   node --test scripts/db-audit/talkx-ai-requests-trail.test.mjs
//
// Sobe um Postgres descartavel e prova, em tres blocos:
//   BLOCO A (vermelho): sem a migration, `talkx_ai_requests` nao existe e as
//     duas chaves de teto nao existem em `talkx_settings`. E exatamente este o
//     estado que faz a edge `talkx-ai` recusar TODA chamada com `ai_disabled`
//     e, se o teto existisse, estourar a primeira gravacao com
//     `trail_write_failed`. Prova o defeito antes de qualquer correcao.
//   BLOCO B (verde): aplica a migration e prova o contrato que a edge assume —
//     tabela e colunas, defaults, CHECKs de kind/status/tokens/custo, custo
//     NULO aceito (sem tarifa nunca vira zero), RLS ligada, policy de SELECT
//     por admin/supervisor e SEM policy de escrita para `authenticated`
//     (o teto nao pode ser burlado apagando a propria trilha), os tres indices
//     das consultas reais e as chaves de teto com o padrao do item.
//   C (idempotencia): reaplica a migration sem erro e confere que um valor de
//     teto ja ajustado pelo dono NAO e sobrescrito pelo `on conflict do nothing`.

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
const CONTAINER = `zapp-v2-talkx-ai-trail-${process.pid}`;
const IMAGE = process.env.TALKX_AI_TRAIL_TEST_POSTGRES_IMAGE || 'postgres:17-alpine';

const arquivos = readdirSync(MIGRATIONS_DIR).filter((f) => /_x076_talkx_ai_requests\.sql$/.test(f));
assert.equal(
  arquivos.length, 1,
  `esperada exatamente 1 migration *_x076_talkx_ai_requests.sql, achei: ${arquivos.join(', ') || 'nenhuma'}`,
);
const migrationSql = readFileSync(join(MIGRATIONS_DIR, arquivos[0]), 'utf8');

function docker(args, opts = {}) {
  return spawnSync(DOCKER, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
}

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

/** Roda SQL que DEVE falhar e devolve a mensagem; falha o teste se passar. */
function psqlFalha(sql) {
  const r = psql(sql);
  assert.notEqual(r.status, 0, `o SQL deveria ser recusado e passou: ${sql}`);
  return `${r.stderr}${r.stdout}`;
}

function dormir(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Superficie minima: os dois papeis de aplicacao, o schema auth que as policies
// usam e o predicado de papel que a migration referencia. `is_admin_or_supervisor`
// aqui e um duplo FUNCIONAL (tabela de papeis de teste): o que o teste prova nao e
// o corpo dela — e que a policy CHAMA esse predicado em vez de `using (true)`.
const PRE_SQL = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.papeis_de_teste (user_id uuid PRIMARY KEY, staff boolean NOT NULL DEFAULT false);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT COALESCE((SELECT staff FROM public.papeis_de_teste WHERE user_id = _user_id), false) $$;
GRANT SELECT, INSERT, UPDATE ON public.talkx_settings TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT SELECT ON auth.users TO authenticated;
`;

before(() => {
  const info = docker(['info']);
  assert.equal(info.status, 0, 'daemon docker inacessivel: a prova em Postgres descartavel nao pode rodar');
  const run = docker(['run', '--rm', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=test_only', IMAGE]);
  assert.equal(run.status, 0, `docker run falhou: ${run.stderr}`);
  let pronto = 0;
  for (let i = 0; i < 90 && pronto < 2; i += 1) {
    if (psql('SELECT 1').status === 0) pronto += 1;
    else { pronto = 0; dormir(1000); }
  }
  assert.ok(pronto >= 2, 'postgres descartavel nao ficou pronto de forma estavel');
  psqlOk(PRE_SQL);
});

after(() => {
  docker(['rm', '-f', CONTAINER]);
});

// ── BLOCO A: o defeito existe antes da migration ─────────────────────────────

test('A1: sem a migration a trilha `talkx_ai_requests` nao existe no banco', () => {
  assert.equal(psqlOk(`SELECT to_regclass('public.talkx_ai_requests') IS NULL;`), 't');
});

test('A2: sem a migration as duas chaves de teto nao existem em talkx_settings', () => {
  psqlOk(`INSERT INTO public.talkx_settings (key, value) VALUES ('ai_insights', 'false'::jsonb);`);
  assert.equal(
    psqlOk(`SELECT count(*) FROM public.talkx_settings
             WHERE key IN ('ai_monthly_budget_usd', 'ai_daily_requests_per_user');`),
    '0',
  );
});

// ── BLOCO B: aplica a migration e prova o contrato ──────────────────────────

let aplicada = false;

function aplicarMigration() {
  const r = psql(migrationSql);
  assert.equal(r.status, 0, `a migration falhou: ${r.stderr || r.stdout}`);
  aplicada = true;
}

test('B0: a migration aplica limpa', () => {
  aplicarMigration();
  assert.ok(aplicada);
});

test('B1: a trilha existe com todas as colunas que a edge grava', () => {
  const colunas = psqlOk(`
    SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
      FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_ai_requests';`);
  assert.equal(
    colunas,
    'id,kind,entity_type,entity_id,input_hash,output,model,tokens_in,tokens_out,cost_usd,status,created_by,created_at',
  );
});

test('B2: kind e status respeitam o dominio que a edge usa', () => {
  psqlOk(`INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-00000000000a');`);
  const inserir = (kind, status) => psqlOk(`
    INSERT INTO public.talkx_ai_requests (kind, input_hash, status, created_by)
    VALUES ('${kind}', 'hash-teste', '${status}', '00000000-0000-0000-0000-00000000000a');`);

  for (const kind of ['insight_text', 'message_variation', 'segment_suggestion']) inserir(kind, 'ok');
  assert.match(psqlFalha(`
    INSERT INTO public.talkx_ai_requests (kind, input_hash, status, created_by)
    VALUES ('kind_inventado', 'h', 'ok', '00000000-0000-0000-0000-00000000000a');`), /talkx_ai_requests_kind_check/);
  assert.match(psqlFalha(`
    INSERT INTO public.talkx_ai_requests (kind, input_hash, status, created_by)
    VALUES ('insight_text', 'h', 'pending', '00000000-0000-0000-0000-00000000000a');`), /talkx_ai_requests_status_check/);
});

test('B3: custo NULO e aceito (sem tarifa) e custo negativo e recusado', () => {
  psqlOk(`
    INSERT INTO public.talkx_ai_requests (kind, input_hash, status, created_by, cost_usd)
    VALUES ('insight_text', 'hash-sem-tarifa', 'ok', '00000000-0000-0000-0000-00000000000a', NULL);`);
  assert.equal(
    psqlOk(`SELECT count(*) FROM public.talkx_ai_requests WHERE input_hash = 'hash-sem-tarifa' AND cost_usd IS NULL;`),
    '1',
    'custo nulo precisa ser gravavel: "sem tarifa" nunca pode virar zero',
  );
  assert.match(psqlFalha(`
    INSERT INTO public.talkx_ai_requests (kind, input_hash, status, created_by, cost_usd)
    VALUES ('insight_text', 'h2', 'ok', '00000000-0000-0000-0000-00000000000a', -0.01);`), /talkx_ai_requests_cost_usd_check/);
});

test('B4: tokens negativos sao recusados', () => {
  assert.match(psqlFalha(`
    INSERT INTO public.talkx_ai_requests (kind, input_hash, status, created_by, tokens_in)
    VALUES ('insight_text', 'h3', 'ok', '00000000-0000-0000-0000-00000000000a', -1);`), /talkx_ai_requests_tokens_in_check/);
});

test('B5: RLS ligada, leitura por admin/supervisor e NENHUMA escrita para authenticated', () => {
  assert.equal(
    psqlOk(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.talkx_ai_requests'::regclass;`),
    't',
  );

  const policies = psqlOk(`
    SELECT string_agg(policyname || ':' || cmd || ':' || COALESCE(qual, '-'), ' | ' ORDER BY policyname)
      FROM pg_policies WHERE schemaname='public' AND tablename='talkx_ai_requests';`);
  assert.equal(policies, 'talkx_ai_requests_admin_read:SELECT:COALESCE(is_admin_or_supervisor(auth.uid()), false)');
  assert.doesNotMatch(policies, /:INSERT:|:UPDATE:|:DELETE:|:ALL:/, 'o cliente nao pode escrever nem apagar a propria trilha');
  assert.doesNotMatch(policies, /:(SELECT|ALL):true$/, 'using (true) vazaria a trilha de todos os usuarios');

  // Prova funcional do predicado: quem nao e staff nao ve nada; quem e staff ve.
  psqlOk(`INSERT INTO public.papeis_de_teste (user_id, staff) VALUES
            ('00000000-0000-0000-0000-00000000000b', false),
            ('00000000-0000-0000-0000-00000000000c', true);`);
  psqlOk(`INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');`);

  assert.equal(
    psqlOk(`SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
            SELECT count(*) FROM public.talkx_ai_requests;`, 'authenticated'),
    '0',
    'usuario comum nao pode ler a trilha',
  );
  assert.notEqual(
    psqlOk(`SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
            SELECT count(*) FROM public.talkx_ai_requests;`, 'authenticated'),
    '0',
    'admin/supervisor precisa conseguir ler a trilha',
  );

  const escrita = psql(`
    INSERT INTO public.talkx_ai_requests (kind, input_hash, status, created_by)
    VALUES ('insight_text', 'h-cliente', 'ok', '00000000-0000-0000-0000-00000000000c');`, 'authenticated');
  assert.notEqual(escrita.status, 0, 'authenticated nao pode inserir na trilha (regra de teto)');
});

test('B6: os tres indices que as consultas reais da edge precisam existem', () => {
  const indices = psqlOk(`
    SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes
     WHERE schemaname='public' AND tablename='talkx_ai_requests'
       AND indexname IN ('talkx_ai_requests_cache_idx','talkx_ai_requests_usuario_dia_idx','talkx_ai_requests_mes_idx');`);
  assert.equal(indices, 'talkx_ai_requests_cache_idx,talkx_ai_requests_mes_idx,talkx_ai_requests_usuario_dia_idx');

  const cache = psqlOk(`
    SELECT indexdef FROM pg_indexes WHERE indexname='talkx_ai_requests_cache_idx';`);
  assert.match(cache, /\(input_hash, created_at DESC\)/, 'o cache busca mesmo hash, mais recente primeiro');
});

test('B7: as chaves de teto nascem com o padrao do item (IA desligada)', () => {
  assert.equal(
    psqlOk(`SELECT value::text FROM public.talkx_settings WHERE key='ai_monthly_budget_usd';`),
    '0',
    'orcamento 0 = desligado: nada de IA paga ligada por default',
  );
  assert.equal(
    psqlOk(`SELECT value::text FROM public.talkx_settings WHERE key='ai_daily_requests_per_user';`),
    '20',
  );
  assert.equal(
    psqlOk(`SELECT value::text FROM public.talkx_settings WHERE key='ai_insights';`),
    'false',
    'a flag pre-existente nao pode ser tocada pela migration',
  );
});

test('B8: a FK de created_by aponta para auth.users com cascata', () => {
  const fk = psqlOk(`
    SELECT confdeltype FROM pg_constraint WHERE conname='talkx_ai_requests_created_by_fkey';`);
  assert.equal(fk, 'c');
});

// ── C: idempotencia sem perder ajuste do dono ───────────────────────────────

test('C1: reaplicar a migration nao sobrescreve o teto ja ajustado', () => {
  psqlOk(`UPDATE public.talkx_settings SET value='150'::jsonb WHERE key='ai_monthly_budget_usd';`);
  aplicarMigration();
  assert.equal(
    psqlOk(`SELECT value::text FROM public.talkx_settings WHERE key='ai_monthly_budget_usd';`),
    '150',
    'on conflict do nothing: o valor escolhido pelo dono manda',
  );
  assert.equal(
    psqlOk(`SELECT count(*) FROM public.talkx_ai_requests;`),
    '4',
    'reaplicar nao pode duplicar nem limpar linhas',
  );
});
