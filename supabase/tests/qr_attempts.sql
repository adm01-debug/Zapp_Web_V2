-- ============================================================================
-- t_7af815d8 — public.qr_attempts (histórico de tentativas de pareamento por QR)
--
-- O QUE PROVA (critério de pronto do cartão):
--   A) a tabela nasce com o CONTRATO: conexão, criado_em, expira_em, status
--      ('pendente'|'conectado'|'expirado'|'erro') e motivo;
--   B) a FK para public.whatsapp_connections é ON DELETE CASCADE;
--   C) status fora do domínio é recusado (CHECK) e o TTL respeita o clamp
--      15-300 s (default 60 s);
--   D) a barreira é a RLS, não a ACL: o papel authenticated TEM o GRANT
--      (provado em T0) e mesmo assim o usuário comum é barrado;
--   E) staff (admin via user_roles) lê e escreve; usuário comum e anon, NADA;
--   F) a retenção de 30 dias roda em public.qr_attempts_purge(), e SÓ o
--      service_role executa; o registro recente sobrevive.
--
-- COMO A PROTEÇÃO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superfície mínima (roles, schema auth, auth.users, profiles, contacts,
-- whatsapp_connections, storage, PUBLICATION) é criada à mão; o contrato vem
-- das migrations REAIS aplicadas por \i logo abaixo. Roda numa única transação
-- que termina em ROLLBACK: idempotente, sem efeito no banco.
--
-- Modo vermelho (a guarda ausente): psql -v sem_guarda=1 … — desliga a RLS da
-- tabela DENTRO da transação; as asserções de comportamento (T5/T6/T9) devem
-- FALHAR, provando que o teste é sensível à proteção.
--
-- Rodar:  psql -X -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/qr_attempts.sql
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superfície mínima (ambiente; o contrato vem das migrations) ───────────────
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ── A PROTEÇÃO, verbatim das migrations REAIS, em ordem ───────────────────────
\echo '── aplicando as migrations REAIS (user_roles/helpers + qr_attempts) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20261012110945_qr_attempts.sql

-- GRANT de tabela do PostgREST: e ele que faz a RLS ser a barreira (prova T0).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_attempts TO authenticated, service_role;

-- ── Fixtures (com o sino de auth.users desligado) ─────────────────────────────
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b');  -- AGENTE
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN t_7af815d8'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE t_7af815d8');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent');
INSERT INTO public.whatsapp_connections (id) VALUES
  ('c0000000-0000-0000-0000-000000000001'),  -- CONN
  ('c0000000-0000-0000-0000-000000000002');  -- CONN_DEL
SET session_replication_role = origin;

-- ── Modo vermelho: a guarda ausente ───────────────────────────────────────────
\if :{?sem_guarda}
  ALTER TABLE public.qr_attempts DISABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS qr_attempts_staff_all ON public.qr_attempts;
  \echo '  [sem_guarda] RLS de qr_attempts desligada (dentro da transacao)'
\endif

-- ── Helpers do próprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 't_7af815d8 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 't_7af815d8 FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT de p_uid.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 't_7af815d8 FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_ret := 'OK ' || v_n;
  EXCEPTION WHEN OTHERS THEN
    v_ret := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_ret;
END $h$;

-- Um único valor, lido sob o PAPEL REAL (controles de leitura).
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

\echo
\echo '── T0: a barreira e a RLS, nao a ACL ──────────────────────────────────'
SELECT pg_temp.espera('T0 authenticated TEM o GRANT de tabela (sem RLS a escrita passaria)',
  has_table_privilege('authenticated', 'public.qr_attempts', 'INSERT,UPDATE,DELETE,SELECT')::text, 'true');
SELECT pg_temp.espera('T0d anon NAO tem GRANT de tabela',
  has_table_privilege('anon', 'public.qr_attempts', 'SELECT')::text, 'false');
\if :{?sem_guarda}
\else
SELECT pg_temp.espera('T0b RLS ligada em qr_attempts',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.qr_attempts'::regclass), 'true');
\endif

\echo
\echo '── BLOCO 1: contrato estrutural ───────────────────────────────────────'
SELECT pg_temp.espera('T1 contrato do cartao: conexao/criado_em/expira_em/status/motivo',
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='qr_attempts'
      AND column_name IN ('connection_id','created_at','expires_at','status','reason')), '5');
SELECT pg_temp.espera('T2 a FK e ON DELETE CASCADE',
  (SELECT c.confdeltype::text FROM pg_constraint c
    WHERE c.conrelid = 'public.qr_attempts'::regclass AND c.contype = 'f'), 'c');
SELECT pg_temp.espera('T3 status default e pendente',
  (SELECT column_default::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='qr_attempts' AND column_name='status'), '''pendente''::text');
SELECT pg_temp.espera_erro('T4 status fora do dominio e recusado',
  pg_temp.operacao('postgres', null, $sql$INSERT INTO public.qr_attempts (connection_id, expires_at, status)
    VALUES ('c0000000-0000-0000-0000-000000000001', now() + interval '60 seconds', 'cancelado')$sql$), '23514');
SELECT pg_temp.espera_erro('T4b TTL abaixo do clamp (5 s) e recusado',
  pg_temp.operacao('postgres', null, $sql$INSERT INTO public.qr_attempts (connection_id, created_at, expires_at)
    VALUES ('c0000000-0000-0000-0000-000000000001', now(), now() + interval '5 seconds')$sql$), '23514');
SELECT pg_temp.espera_erro('T4c TTL acima do clamp (400 s) e recusado',
  pg_temp.operacao('postgres', null, $sql$INSERT INTO public.qr_attempts (connection_id, created_at, expires_at)
    VALUES ('c0000000-0000-0000-0000-000000000001', now(), now() + interval '400 seconds')$sql$), '23514');
SELECT pg_temp.espera('T4d sem expires_at explicito o TTL default e de 60 s',
  pg_temp.operacao('postgres', null, $sql$INSERT INTO public.qr_attempts (connection_id, status) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'pendente')$sql$), 'OK 1');
SELECT pg_temp.espera('T4e o TTL gravado bate com o default',
  (SELECT (extract(epoch FROM (expires_at - created_at)))::int::text FROM public.qr_attempts LIMIT 1), '60');

\echo
\echo '── BLOCO 2: quem pode, quem nao pode, e o anonimo ─────────────────────'
DELETE FROM public.qr_attempts;

-- T5 — staff (admin via user_roles) escreve e le
SELECT pg_temp.espera('T5 admin INSERE a tentativa',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.qr_attempts (connection_id, status) VALUES
      ('c0000000-0000-0000-0000-000000000001', 'pendente')$sql$), 'OK 1');
SELECT pg_temp.espera('T5b admin INSERE com motivo',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.qr_attempts (connection_id, reason) VALUES
      ('c0000000-0000-0000-0000-000000000001', 'timeout ao ler o QRCODE_UPDATED')$sql$), 'OK 1');
SELECT pg_temp.espera('T5c admin LE as duas tentativas',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    'SELECT count(*)::text FROM public.qr_attempts'), '2');

-- T6 — usuario comum (authenticated sem 'admin'): nada
SELECT pg_temp.espera_erro('T6 usuario comum NAO insere (RLS)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.qr_attempts (connection_id) VALUES
      ('c0000000-0000-0000-0000-000000000001')$sql$), '42501');
SELECT pg_temp.espera('T6b usuario comum NAO le (0 linhas)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    'SELECT count(*)::text FROM public.qr_attempts'), '0');

-- T7 — anonimo: nada
SELECT pg_temp.espera_erro('T7 anon NAO insere',
  pg_temp.operacao('anon', null, $sql$INSERT INTO public.qr_attempts (connection_id) VALUES
    ('c0000000-0000-0000-0000-000000000001')$sql$), '42501');
SELECT pg_temp.espera('T7b anon NAO le',
  pg_temp.valor('anon', null, 'SELECT count(*)::text FROM public.qr_attempts'), 'ERRO 42501');

\echo
\echo '── BLOCO 3: CASCADE e retencao de 30 dias ─────────────────────────────'
-- T8 — apagar a conexao leva o historico dela
SELECT pg_temp.espera('T8 admin abre tentativa na Conexao B',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.qr_attempts (connection_id) VALUES
      ('c0000000-0000-0000-0000-000000000002')$sql$), 'OK 1');
SELECT pg_temp.espera('T8b a tentativa da Conexao B existe',
  (SELECT count(*)::text FROM public.qr_attempts
    WHERE connection_id = 'c0000000-0000-0000-0000-000000000002'), '1');
DELETE FROM public.whatsapp_connections WHERE id = 'c0000000-0000-0000-0000-000000000002';
SELECT pg_temp.espera('T8c CASCADE: apagar a conexao levou as tentativas dela',
  (SELECT count(*)::text FROM public.qr_attempts
    WHERE connection_id = 'c0000000-0000-0000-0000-000000000002'), '0');

-- T9 — a purga
DELETE FROM public.qr_attempts;
INSERT INTO public.qr_attempts (connection_id, created_at, expires_at, status) VALUES
  ('c0000000-0000-0000-0000-000000000001', now() - interval '31 days',
   now() - interval '31 days' + interval '60 seconds', 'expirado'),
  ('c0000000-0000-0000-0000-000000000001', now(),
   now() + interval '60 seconds', 'pendente');
SELECT pg_temp.espera('T9 ha a antiga (31 dias) e a recente', 
  (SELECT count(*)::text FROM public.qr_attempts), '2');
SELECT pg_temp.espera('T9b service_role executa a purga e remove so a de 31 dias',
  pg_temp.operacao('service_role', null, 'SELECT public.qr_attempts_purge()'), 'OK 1');
SELECT pg_temp.espera('T9c a recente sobreviveu (retencao de 30 dias, nao tudo)',
  (SELECT count(*)::text FROM public.qr_attempts), '1');
SELECT pg_temp.espera_erro('T9d authenticated NAO executa a purga',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    'SELECT public.qr_attempts_purge()'), '42501');
SELECT pg_temp.espera_erro('T9e anon NAO executa a purga',
  pg_temp.operacao('anon', null, 'SELECT public.qr_attempts_purge()'), '42501');

\echo
\echo '── BLOCO 4: a linha -- Rollback: executa ──────────────────────────────'
-- Reproduz as duas instrucoes do bloco "-- Rollback (SQL executavel, na ordem):"
-- de supabase/migrations/20261012110945_qr_attempts.sql.
SELECT pg_temp.espera('T10 rollback: drop function',
  pg_temp.operacao('postgres', null, 'DROP FUNCTION IF EXISTS public.qr_attempts_purge()'), 'OK 0');
SELECT pg_temp.espera('T10b rollback: drop table',
  pg_temp.operacao('postgres', null, 'DROP TABLE IF EXISTS public.qr_attempts'), 'OK 0');
SELECT pg_temp.espera('T10c apos o rollback a tabela sumiu',
  (to_regclass('public.qr_attempts') IS NULL)::text, 'true');
SELECT pg_temp.espera('T10d apos o rollback a funcao sumiu',
  (to_regprocedure('public.qr_attempts_purge()') IS NULL)::text, 'true');

\echo
\echo 'PASS: TC qr_attempts — contrato do cartao, FK CASCADE, dominio de status, clamp de TTL,'
\echo '      RLS staff-only (usuario comum e anon barrados), retencao de 30 dias so por service_role'
\echo '      e rollback executavel.'

ROLLBACK;
