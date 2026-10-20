-- ============================================================================
-- N-001 (achado M4 — docs/audits/VALIDACAO_CORRECOES_2026-08-28.md:48)
-- "Só admin troca papel em public.user_roles, e toda troca — inclusive edição
--  (UPDATE) — fica registrada."
--
-- O QUE PROVA (critério de pronto do cartão t_9560e2ce):
--   A) um AGENTE (papel `authenticated` sem 'admin' em user_roles) NÃO consegue
--      INSERT, UPDATE nem DELETE em public.user_roles — nem para si mesmo
--      (auto-promoção);
--   B) um SUPERVISOR também não (a autoridade é `has_role(uid,'admin')`, não
--      `is_admin_or_supervisor`);
--   C) um ADMIN consegue as três operações e CADA UMA gera EXATAMENTE 1 linha
--      em public.audit_logs com entity_type='user_roles';
--   D) operação NEGADA não deixa linha de auditoria (nada a forjar);
--   E) a barreira é a RLS, não a ACL: o papel `authenticated` TEM o GRANT de
--      tabela (provado por has_table_privilege) — sem RLS a escrita passaria.
--
-- NOMES DE action: o cartão cita `role_created/role_updated/role_deleted`, que é
-- o vocabulário da PRIMEIRA versão do gatilho
-- (supabase/migrations/20260409224329_51d839cf-6068-4a17-b32b-9a7e12866a61.sql:16,26,40).
-- O vocabulário VIGENTE — e o que este teste verifica — é
-- `role_granted` / `role_changed` / `role_revoked`, redefinido por
-- 20260830010000 (ramo UPDATE ausente, F01), 20260924125400 (atribuição forense)
-- e consolidado em 20261003272707_reconcile_local_replay_with_canonical.sql:220.
-- O front lê exatamente esses três nomes
-- (src/components/security/AuditLogDashboard.tsx:28). Testar o vocabulário antigo
-- daria verde a um contrato que o produto não usa.
--
-- COMO A PROTEÇÃO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superfície mínima (roles, schema auth, tabelas, PUBLICATION) é criada à mão —
-- é ambiente, não contrato — e a PROTEÇÃO é aplicada VERBATIM dos arquivos de
-- migration do repositório, via `\i`, na ordem cronológica. Mesmo padrão de
-- supabase/tests/r2_db_022_provenance_trigger.sql e
-- scripts/db-audit/dashboard-rls-authorization.test.sh.
--
-- ENFORCEMENT exercido como PAPEL REAL: as asserções rodam com `SET LOCAL ROLE
-- authenticated` + JWT sintético em request.jwt.claims — o caminho do PostgREST,
-- nunca como postgres/superusuário (que ignora RLS e GRANT). Cada operação
-- confere dentro do helper que `current_user` é de fato o papel pedido: se o
-- papel não pegasse, o teste FALHA em vez de dar verde.
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-n001-roles-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-n001-roles-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql
--   docker rm -f zapp-n001-roles-$$
--
-- VERMELHO (o teste falha quando a correção não está lá): acrescente `-v sem_guarda=1`.
--   Com sem_guarda a RLS de user_roles é desligada e o gatilho de auditoria é
--   derrubado DENTRO da transação — nada persiste porque o arquivo termina em ROLLBACK.
--
-- Tudo roda numa única transação que termina em ROLLBACK: idempotente, sem
-- efeito colateral e reaplicável.
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text DEFAULT 'agent',
  permissions jsonb DEFAULT '{}'::jsonb,
  access_level text DEFAULT 'active',
  is_active boolean DEFAULT true
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.warroom_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ── Administrador: as fixtures entram sem disparar o sino de auth.users ──────
SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b'),  -- AGENTE
  ('33333333-3333-3333-3333-33333333333c'),  -- ALVO
  ('44444444-4444-4444-4444-44444444444d');  -- SUPERVISOR

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN N-001'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE N-001'),
  ('c0000000-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-33333333333c', 'ALVO N-001'),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-44444444444d', 'SUPERVISOR N-001');

SET session_replication_role = origin;

-- ── A PROTEÇÃO, verbatim das migrations reais, em ordem cronológica ──────────
\echo '── aplicando as migrations REAIS (user_roles: tabela, helpers, policies, gatilho) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20260404172304_3c3f4a06-e027-4f21-99c4-e9ffd3d45ad0.sql
\i :mig_dir/20260404172448_b47ca20c-ea67-459f-aa6a-e70fad44054f.sql
\i :mig_dir/20260409224329_51d839cf-6068-4a17-b32b-9a7e12866a61.sql
\i :mig_dir/20260411110804_863265b0-05d5-40cf-96cb-f4d6014dfe3d.sql
\i :mig_dir/20260830010000_fix_audit_role_changes_add_update_case.sql
\i :mig_dir/20260924125400_fix_audit_role_changes_function_name_mismatch.sql

-- GRANT de tabela do PostgREST sobre os objetos que as migrations acabaram de
-- criar: é ele que faz a RLS ser a ÚNICA barreira (provado em T0).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles, public.audit_logs
  TO authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;

-- Fixtures de papel (depois das policies, com o gatilho de auth.users desligado)
SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent'),
  ('33333333-3333-3333-3333-33333333333c', 'agent'),
  ('44444444-4444-4444-4444-44444444444d', 'supervisor');
SET session_replication_role = origin;

DELETE FROM public.audit_logs;   -- baseline: só as operações do teste contam

-- ── Modo vermelho: a correção ausente ───────────────────────────────────────
\if :{?sem_guarda}
  ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
  DROP TRIGGER IF EXISTS audit_user_role_changes ON public.user_roles;
  \echo '  [sem_guarda] RLS de user_roles desligada e gatilho de auditoria derrubado (dentro da transacao)'
\endif

-- ── Helpers do próprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'N-001 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'N-001 FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT do usuário p_uid.
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'. O bloco EXCEPTION
-- interno garante que uma operação negada NÃO aborta a transação do teste.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'N-001 FALHOU: papel real nao aplicado (current_user=%)', current_user;
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
\echo '── T0: a barreira e a RLS, nao a ACL ───────────────────────────────────'
SELECT pg_temp.espera('T0 authenticated TEM INSERT/UPDATE/DELETE/SELECT na tabela (GRANT do PostgREST)',
  has_table_privilege('authenticated', 'public.user_roles', 'INSERT,UPDATE,DELETE,SELECT')::text, 'true');
-- Os dois auto-testes abaixo conferem que a correção ESTÁ no banco. No modo
-- sem_guarda eles são pulados de propósito: se falhassem aqui, o vermelho
-- apareceria antes das asserções de comportamento (T1/T11) — que é o que
-- interessa provar sensível.
\if :{?sem_guarda}
\else
SELECT pg_temp.espera('T0b RLS ligada em user_roles',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.user_roles'::regclass), 'true');
SELECT pg_temp.espera('T0c gatilho de auditoria dispara em INSERT OR UPDATE OR DELETE',
  (SELECT (pg_get_triggerdef(oid) LIKE '%INSERT%' AND pg_get_triggerdef(oid) LIKE '%UPDATE%'
           AND pg_get_triggerdef(oid) LIKE '%DELETE%')::text
     FROM pg_trigger WHERE tgname = 'audit_user_role_changes'), 'true');
\endif

\echo
\echo '── BLOCO A: o AGENTE (e o SUPERVISOR) nao trocam papel em user_roles ──────'

-- T1 — INSERT: RLS bloqueia a linha nova (WITH CHECK)
SELECT pg_temp.espera_erro('T1 agente nao INSERT em user_roles',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-3333-3333-3333-33333333333c', 'admin')$sql$),
  '42501');
SELECT pg_temp.espera('T1b o INSERT recusado nao criou meia linha',
  (SELECT count(*)::text FROM public.user_roles WHERE user_id = '33333333-3333-3333-3333-33333333333c'), '1');

-- T2 — UPDATE do papel de OUTRO: USING falso -> 0 linhas, valor intacto
SELECT pg_temp.espera('T2 agente nao UPDATE o papel de outro (0 linhas)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.user_roles SET role = 'admin' WHERE user_id = '33333333-3333-3333-3333-33333333333c'$sql$),
  'OK 0');
SELECT pg_temp.espera('T2b o papel do alvo continua agent',
  (SELECT role::text FROM public.user_roles WHERE user_id = '33333333-3333-3333-3333-33333333333c'), 'agent');

-- T3 — DELETE do papel de OUTRO: 0 linhas
SELECT pg_temp.espera('T3 agente nao DELETE o papel de outro (0 linhas)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$DELETE FROM public.user_roles WHERE user_id = '33333333-3333-3333-3333-33333333333c'$sql$),
  'OK 0');
SELECT pg_temp.espera('T3b a linha do alvo continua existindo',
  (SELECT count(*)::text FROM public.user_roles WHERE user_id = '33333333-3333-3333-3333-33333333333c'), '1');

-- T4 — AUTO-PROMOÇÃO: o vetor de escalação de privilégio
SELECT pg_temp.espera('T4 agente nao se auto-promove a admin (0 linhas)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.user_roles SET role = 'admin' WHERE user_id = '22222222-2222-2222-2222-22222222222b'$sql$),
  'OK 0');
SELECT pg_temp.espera('T4b o papel do agente continua agent',
  (SELECT role::text FROM public.user_roles WHERE user_id = '22222222-2222-2222-2222-22222222222b'), 'agent');

-- T5 — SUPERVISOR: a autoridade é do admin, não de admin-ou-supervisor
SELECT pg_temp.espera('T5 supervisor nao troca papel de outro (0 linhas)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$UPDATE public.user_roles SET role = 'admin' WHERE user_id = '33333333-3333-3333-3333-33333333333c'$sql$),
  'OK 0');

-- T6 — o que foi negado não vai para a trilha
SELECT pg_temp.espera('T6 nenhuma tentativa negada gerou auditoria',
  (SELECT count(*)::text FROM public.audit_logs WHERE entity_type = 'user_roles'), '0');

-- T7 — controle positivo de leitura: a barreira é de ESCRITA
SELECT pg_temp.espera('T7 o agente continua lendo o proprio papel',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT count(*)::text FROM public.user_roles WHERE user_id = '22222222-2222-2222-2222-22222222222b'$sql$),
  '1');

\echo
\echo '── BLOCO B: o ADMIN troca papel e cada operacao deixa 1 linha na trilha ──'

-- T8 — INSERT (role_granted)
SELECT pg_temp.espera('T8 admin INSERT supervisor para o alvo (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-3333-3333-3333-33333333333c', 'supervisor')$sql$),
  'OK 1');

-- T9 — UPDATE (role_changed): a troca por EDIÇÃO, que o inventário dizia faltar
SELECT pg_temp.espera('T9 admin troca supervisor -> admin do alvo (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.user_roles SET role = 'admin' WHERE user_id = '33333333-3333-3333-3333-33333333333c' AND role = 'supervisor'$sql$),
  'OK 1');

-- T10 — DELETE (role_revoked)
SELECT pg_temp.espera('T10 admin revoga o admin do alvo (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$DELETE FROM public.user_roles WHERE user_id = '33333333-3333-3333-3333-33333333333c' AND role = 'admin'$sql$),
  'OK 1');

-- T11 — exatamente 1 linha de auditoria por operação (e nenhuma a mais)
SELECT pg_temp.espera('T11a 1 role_granted',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_granted'
      AND details->>'user_id' = '33333333-3333-3333-3333-33333333333c'), '1');
SELECT pg_temp.espera('T11b 1 role_changed',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_changed'
      AND details->>'user_id' = '33333333-3333-3333-3333-33333333333c'), '1');
SELECT pg_temp.espera('T11c 1 role_revoked',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_revoked'
      AND details->>'user_id' = '33333333-3333-3333-3333-33333333333c'), '1');
SELECT pg_temp.espera('T11d a trilha tem exatamente as 3 linhas do cartao',
  (SELECT count(*)::text FROM public.audit_logs WHERE entity_type = 'user_roles'), '3');

-- T12 — conteúdo: quem trocou, de que para que
SELECT pg_temp.espera('T12a role_changed registra old_role e new_role',
  (SELECT (details->>'old_role') || ' -> ' || (details->>'new_role') FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_changed'), 'supervisor -> admin');
SELECT pg_temp.espera('T12b role_granted registra o papel concedido',
  (SELECT details->>'role' FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_granted'), 'supervisor');
SELECT pg_temp.espera('T12c role_revoked registra o papel revogado',
  (SELECT details->>'role' FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND action = 'role_revoked'), 'admin');
SELECT pg_temp.espera('T12d as 3 linhas apontam o admin como autor (coluna user_id)',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles'
      AND user_id = '11111111-1111-1111-1111-11111111111a'), '3');
SELECT pg_temp.espera('T12e atribuicao forense marcada como jwt',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles' AND details->>'actor_kind' = 'jwt'), '3');
SELECT pg_temp.espera('T12f as 3 linhas apontam a MESMA linha de user_roles mexida',
  (SELECT count(DISTINCT entity_id)::text FROM public.audit_logs
    WHERE entity_type = 'user_roles'), '1');

\echo
\echo '── T13: efeito colateral — a fixture nao virou trilha ───────────────────'
SELECT pg_temp.espera('T13 a trilha so tem as operacoes do BLOCO B (um unico autor)',
  (SELECT count(DISTINCT user_id)::text FROM public.audit_logs WHERE entity_type = 'user_roles'), '1');

ROLLBACK;

\echo
\echo 'N-001 OK: agente/supervisor bloqueados nas 3 operacoes; o admin executa as 3'
\echo '          e cada uma deixa exatamente 1 linha em audit_logs.'
