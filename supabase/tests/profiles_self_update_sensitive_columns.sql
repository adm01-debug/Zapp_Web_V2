-- ============================================================================
-- profiles_self_update_sensitive_columns — trava contra o PATCH do próprio
-- usuário nas colunas sensíveis de public.profiles.
--
-- O QUE PROVA (critério de pronto do cartão t_ab80cbc1):
--   A) agente muda o PRÓPRIO nome (e nickname/signature/job_title/phone/avatar_url)
--      -> passa; reenviar o valor ATUAL de uma coluna protegida (no-op) também passa;
--   B) agente muda cada coluna protegida do PRÓPRIO perfil
--      (can_download, max_chats, session_invalidated_at, department, department_id)
--      -> RECUSADO pelo gatilho BEFORE UPDATE (P0001) e o valor não muda;
--   C) supervisor e admin mudam essas colunas DE OUTRO usuário -> passam;
--   D) anônimo não escreve (RLS: nenhuma policy permissiva de UPDATE) e o valor
--      não muda;
--   E) os caminhos internos seguem abertos: service_role (auth.uid() nulo) e
--      app.internal_role_sync = 'true' (sync_profile_role_from_user_roles).
--
-- POR QUE O GATILHO E NÃO A POLICY: a policy RESTRITIVA
-- 'Block sensitive field changes by non-admins' (20260405230710) compara com a
-- linha atual role/access_level/permissions/is_active — ela segue valendo e é
-- exercida em T2f..T2i. O gatilho prevent_profile_privilege_escalation
-- (20260830161547) vigiava só role/permissions/access_level; é ele que passa a
-- cobrir as 5 colunas novas (migration 20261015232546). O gatilho é a defesa em
-- profundidade: vale mesmo onde a RLS não decide.
--
-- COMO A PROTEÇÃO ENTRA NO TESTE (nada de copiar a trava para dentro do arquivo):
-- a superfície mínima (roles, schema auth, tabelas de apoio) é criada à mão — é
-- ambiente, não contrato — e a PROTEÇÃO é aplicada VERBATIM dos arquivos de
-- migration do repositório, via \i, em ordem cronológica — inclusive o gatilho
-- de public.profiles (20260318121449:30-34) e a policy restritiva de
-- role/access_level/permissions/is_active (20260405230710).
--
-- ENFORCEMENT como PAPEL REAL: as asserções rodam com SET LOCAL ROLE
-- authenticated/anon/service_role + JWT sintético em request.jwt.claims — o
-- caminho do PostgREST, nunca como postgres. O helper confere current_user.
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-profsens-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-profsens-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/profiles_self_update_sensitive_columns.sql
--   docker rm -f zapp-profsens-$$
--
-- VERMELHO (o teste falha quando a correção não está lá): acrescente
--   `-v sem_guarda=1` — a migration 20261015232546 NÃO é aplicada e T2a..T2e
--   passam a gravar (é o defeito). Nada persiste: o arquivo termina em ROLLBACK.
-- Tudo roda numa única transação que termina em ROLLBACK: idempotente e reaplicável.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superfície mínima (ambiente; o contrato vem das migrations logo abaixo) ──
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text);
CREATE PUBLICATION supabase_realtime;

-- public.profiles com as colunas REAIS (supabase/schema-catalog.json), RLS ligada.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  avatar_url text,
  role text DEFAULT 'agent' CHECK (role IN ('admin', 'supervisor', 'agent')),
  max_chats integer DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  job_title text,
  department text,
  phone text,
  access_level text,
  permissions jsonb,
  is_active boolean,
  session_invalidated_at timestamptz,
  birthday date,
  nickname text,
  signature text,
  can_download boolean NOT NULL DEFAULT false,
  department_id uuid
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabelas de apoio que as migrations aplicadas referenciam.
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assigned_to uuid);
CREATE TABLE public.conversation_sla (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid);
CREATE TABLE public.rate_limit_configs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.warroom_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.gmail_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ── A PROTEÇÃO, verbatim das migrations reais, em ordem cronológica ──────────
\echo '── aplicando as migrations REAIS (papéis, policies de UPDATE e gatilhos) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20260318121449_24b7aa75-6b70-4eb0-80e0-ba5b9bcc0220.sql
\i :mig_dir/20260404172304_3c3f4a06-e027-4f21-99c4-e9ffd3d45ad0.sql
\i :mig_dir/20260405230710_35b60740-aa0f-437d-9029-f5c0d8e1edf0.sql
\i :mig_dir/20260830080000_fn_is_admin_and_fix_permissions_rls.sql
\i :mig_dir/20260830161547_fix_prevent_privilege_escalation_allow_internal_sync.sql

-- 20260318121449:30-34 cria o gatilho prevent_privilege_escalation
-- (BEFORE UPDATE FOR EACH ROW em public.profiles) — a trava em vigor.

-- ── A CORREÇÃO sob teste: a migration NOVA do cartão ─────────────────────────
\if :{?sem_guarda}
  \echo '  [sem_guarda] migration 20261015232546 NAO aplicada (estado anterior: o defeito)'
\else
  \i :mig_dir/20261015232546_profiles_self_update_sensitive_columns.sql
\endif

-- GRANT de tabela do PostgREST: é ele que faz a RLS ser a ÚNICA barreira de anon.
GRANT SELECT, UPDATE ON public.profiles TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.profiles TO anon;

-- ── Fixtures (sem disparar gatilhos/FK de auth) ──────────────────────────────
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- AGENTE
  ('22222222-2222-2222-2222-22222222222b'),  -- ALVO (outro agente)
  ('33333333-3333-3333-3333-33333333333c'),  -- SUPERVISOR
  ('44444444-4444-4444-4444-44444444444d');  -- ADMIN
INSERT INTO public.profiles
  (id, user_id, name, role, access_level, permissions, is_active, can_download, max_chats, department, department_id)
VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'AGENTE SENS', 'agent', 'agent', '{}'::jsonb, true, false, 3, 'outros', NULL),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'ALVO SENS',   'agent', 'agent', '{}'::jsonb, true, false, 3, 'outros', NULL),
  ('c0000000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-33333333333c', 'SUPER SENS',  'supervisor', 'supervisor', '{}'::jsonb, true, false, 10, 'outros', NULL),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-44444444444d', 'ADMIN SENS',  'admin', 'admin', '{}'::jsonb, true, true, 100, 'outros', NULL);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'agent'),
  ('22222222-2222-2222-2222-22222222222b', 'agent'),
  ('33333333-3333-3333-3333-33333333333c', 'supervisor'),
  ('44444444-4444-4444-4444-44444444444d', 'admin');
SET session_replication_role = origin;

-- ── Helpers do próprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'SENS FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_set_clause sobre a linha de p_target sob o PAPEL REAL, com o JWT p_claims.
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_claims jsonb, p_set_clause text, p_target uuid)
RETURNS text LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', coalesce(p_claims, '{}'::jsonb)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_claims ->> 'sub', ''), true);
  PERFORM set_config('request.jwt.claim.role', coalesce(p_claims ->> 'role', ''), true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'SENS FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE format('UPDATE public.profiles SET %s WHERE user_id = %L', p_set_clause, p_target);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_ret := 'OK ' || v_n;
  EXCEPTION WHEN OTHERS THEN
    v_ret := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_ret;
END $h$;

-- Um único valor, lido sob o PAPEL REAL.
CREATE FUNCTION pg_temp.valor(p_papel text, p_claims jsonb, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', coalesce(p_claims, '{}'::jsonb)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_claims ->> 'sub', ''), true);
  PERFORM set_config('request.jwt.claim.role', coalesce(p_claims ->> 'role', ''), true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

-- ── Pendências de suporte (colunas, gatilho e RLS ligados) ──────────────────
SELECT pg_temp.espera('S0 RLS ligada em profiles',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.profiles'::regclass), 'true');
SELECT pg_temp.espera('S0 gatilho prevent_privilege_escalation ativo',
  (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
     AND tgname = 'prevent_privilege_escalation' AND tgenabled <> 'D'), '1');
SELECT pg_temp.espera('S0 anon TEM o GRANT de UPDATE (a barreira dele e a RLS)',
  has_table_privilege('anon', 'public.profiles', 'UPDATE')::text, 'true');

\echo
\echo '── T1: fluxos do proprio usuario seguem intactos (criterio 2) ──────────'
SELECT pg_temp.espera('T1 agente muda o proprio nome',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'name = ''AGENTE SENS (editado)''', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
SELECT pg_temp.espera('T1 agente muda nickname',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'nickname = ''Zé''', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
SELECT pg_temp.espera('T1 agente muda signature',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'signature = ''Atenciosamente''', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
SELECT pg_temp.espera('T1 agente muda job_title',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'job_title = ''Atendente''', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
SELECT pg_temp.espera('T1 agente muda phone',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'phone = ''11900000000''', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
SELECT pg_temp.espera('T1 agente muda avatar_url',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'avatar_url = ''https://local/avatar.png''', '11111111-1111-1111-1111-11111111111a'), 'OK 1');

\echo
\echo '── T2: PATCH do agente nas colunas protegidas RECUSA e nao muda o valor ─'
SELECT pg_temp.espera('T2a agente muda can_download (bloqueio de download)',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'can_download = true', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators or supervisors can modify can_download, max_chats, session_invalidated_at, department, or department_id');
SELECT pg_temp.espera('T2b agente muda max_chats (carga de chats)',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'max_chats = 999', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators or supervisors can modify can_download, max_chats, session_invalidated_at, department, or department_id');
SELECT pg_temp.espera('T2c agente muda session_invalidated_at (reativacao)',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'session_invalidated_at = now()', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators or supervisors can modify can_download, max_chats, session_invalidated_at, department, or department_id');
SELECT pg_temp.espera('T2d agente muda department',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'department = ''diretoria''', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators or supervisors can modify can_download, max_chats, session_invalidated_at, department, or department_id');
SELECT pg_temp.espera('T2e agente muda department_id',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'department_id = ''aaaaaaaa-0000-0000-0000-0000000000aa''', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators or supervisors can modify can_download, max_chats, session_invalidated_at, department, or department_id');

-- As colunas de autorizacao seguem protegidas como antes (gatilho, P0001):
SELECT pg_temp.espera('T2f agente muda role',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'role = ''admin''', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators can modify role, permissions, or access_level');
SELECT pg_temp.espera('T2g agente muda access_level',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'access_level = ''admin''', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators can modify role, permissions, or access_level');
SELECT pg_temp.espera('T2h agente muda permissions',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'permissions = ''{"all":true}''::jsonb', '11111111-1111-1111-1111-11111111111a'), 'ERRO P0001 Only administrators can modify role, permissions, or access_level');
-- is_active nao esta no gatilho: quem recusa e a policy RESTRITIVA (RLS, 42501).
SELECT pg_temp.espera('T2i agente muda is_active (policy restritiva)',
  left(pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'is_active = false', '11111111-1111-1111-1111-11111111111a'), 8), 'ERRO 425');

-- Nada mudou de fato:
SELECT pg_temp.espera('T2z can_download continua false',
  pg_temp.valor('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'SELECT can_download::text FROM public.profiles WHERE user_id = ''11111111-1111-1111-1111-11111111111a'''), 'false');
SELECT pg_temp.espera('T2z max_chats continua 3',
  pg_temp.valor('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'SELECT max_chats::text FROM public.profiles WHERE user_id = ''11111111-1111-1111-1111-11111111111a'''), '3');
SELECT pg_temp.espera('T2z department continua outros',
  pg_temp.valor('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'SELECT department FROM public.profiles WHERE user_id = ''11111111-1111-1111-1111-11111111111a'''), 'outros');
SELECT pg_temp.espera('T2z session_invalidated_at continua nulo',
  pg_temp.valor('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'SELECT coalesce(session_invalidated_at::text, ''nulo'') FROM public.profiles WHERE user_id = ''11111111-1111-1111-1111-11111111111a'''), 'nulo');
SELECT pg_temp.espera('T2z department_id continua nulo',
  pg_temp.valor('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'SELECT coalesce(department_id::text, ''nulo'') FROM public.profiles WHERE user_id = ''11111111-1111-1111-1111-11111111111a'''), 'nulo');

\echo
\echo '── T3: no-op (reenviar o valor atual) e admin/supervisor NAO quebram ────'
SELECT pg_temp.espera('T3a agente reenvia can_download atual (tela manda o payload inteiro)',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'can_download = false', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
SELECT pg_temp.espera('T3b supervisor muda can_download de outro (tela de admin)',
  pg_temp.operacao('authenticated', '{"sub":"33333333-3333-3333-3333-33333333333c","role":"authenticated"}'::jsonb,
    'can_download = true', '22222222-2222-2222-2222-22222222222b'), 'OK 1');
SELECT pg_temp.espera('T3c supervisor muda max_chats/department_id de outro',
  pg_temp.operacao('authenticated', '{"sub":"33333333-3333-3333-3333-33333333333c","role":"authenticated"}'::jsonb,
    'max_chats = 7, department_id = ''bbbbbbbb-0000-0000-0000-0000000000bb''', '22222222-2222-2222-2222-22222222222b'), 'OK 1');
SELECT pg_temp.espera('T3d admin muda can_download de outro',
  pg_temp.operacao('authenticated', '{"sub":"44444444-4444-4444-4444-44444444444d","role":"authenticated"}'::jsonb,
    'can_download = true', '22222222-2222-2222-2222-22222222222b'), 'OK 1');
SELECT pg_temp.espera('T3e admin muda department e max_chats de outro',
  pg_temp.operacao('authenticated', '{"sub":"44444444-4444-4444-4444-44444444444d","role":"authenticated"}'::jsonb,
    'department = ''comercial'', max_chats = 20', '22222222-2222-2222-2222-22222222222b'), 'OK 1');
SELECT pg_temp.espera('T3f admin muda session_invalidated_at de outro',
  pg_temp.operacao('authenticated', '{"sub":"44444444-4444-4444-4444-44444444444d","role":"authenticated"}'::jsonb,
    'session_invalidated_at = now()', '22222222-2222-2222-2222-22222222222b'), 'OK 1');

\echo
\echo '── T4: anonimo nao escreve (RLS) e o valor nao muda ────────────────────'
SELECT pg_temp.espera('T4a anon tenta mudar can_download do agente',
  pg_temp.operacao('anon', '{"role":"anon"}'::jsonb,
    'can_download = true', '11111111-1111-1111-1111-11111111111a'), 'OK 0');
SELECT pg_temp.espera('T4b anon tenta mudar department do agente',
  pg_temp.operacao('anon', '{"role":"anon"}'::jsonb,
    'department = ''diretoria''', '11111111-1111-1111-1111-11111111111a'), 'OK 0');
SELECT pg_temp.espera('T4z can_download do agente continua false',
  (SELECT can_download::text FROM public.profiles WHERE user_id = '11111111-1111-1111-1111-11111111111a'), 'false');

\echo
\echo '── T5: caminhos internos preservados (service_role e sync) ─────────────'
SELECT pg_temp.espera('T5a service_role (auth.uid nulo) grava session_invalidated_at',
  pg_temp.operacao('service_role', '{"role":"service_role"}'::jsonb,
    'session_invalidated_at = now()', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
SELECT pg_temp.espera('T5b service_role grava can_download',
  pg_temp.operacao('service_role', '{"role":"service_role"}'::jsonb,
    'can_download = true', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
-- O flag so e ligado por funcao interna SECURITY DEFINER (sync_profile_role_from_user_roles).
SET LOCAL app.internal_role_sync = 'true';
SELECT pg_temp.espera('T5c operacao interna (app.internal_role_sync) grava can_download',
  pg_temp.operacao('authenticated', '{"sub":"11111111-1111-1111-1111-11111111111a","role":"authenticated"}'::jsonb,
    'can_download = false', '11111111-1111-1111-1111-11111111111a'), 'OK 1');
RESET app.internal_role_sync;

\echo
\echo 'PASS: Profiles self-update sensivel — 5 colunas recusadas para o agente, admin/supervisor/service_role OK, anon sem escrita.'
ROLLBACK;
