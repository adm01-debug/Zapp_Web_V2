-- ============================================================================
-- Auditoria de seguranca (paridade V3, frente SH) — cartao t_4d66a644
-- "Resumo agregado de audit_logs por periodo (RPC admin-only) + lista paginada
--  por cursor com o nome do autor."
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) public.audit_log_summary(p_from, p_to) devolve, para o ADMIN, os totais
--      REAIS do periodo e os KPIs (denied_24h, permission_changes_24h,
--      admin_logins_7d, rls_failures_24h) — cada numero conferido contra a
--      contagem direta da tabela (baseline do superusuario);
--   B) fail-closed: AGENTE e ANON recebem ZERO linhas (nunca NaN, nunca dado);
--   C) public.audit_log_list(...) traz actor_name de profiles e pagina por
--      CURSOR (created_at, id) DESC sem pular nem repetir linha;
--   D) ACL: EXECUTE so para authenticated/service_role; anon sem EXECUTE;
--      SECURITY DEFINER ligado com search_path fixo;
--   E) entrada invalida nao estoura: periodo invertido -> vazio; limite
--      fora da faixa -> normalizado (1..200).
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar funcao para dentro do arquivo):
-- a superficie minima (roles, schema auth, tabelas de ambiente, PUBLICATION) e
-- criada a mao — e ambiente, nao contrato — e a PROTECAO vem VERBATIM do arquivo
-- de migration do repositorio, via `\i`. As tabelas de contrato (audit_logs,
-- user_roles, has_role) vem da migration real 20251215025014. Mesmo padrao de
-- supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql.
--
-- ENFORCEMENT como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated` + JWT sintetico em request.jwt.claims — o caminho do PostgREST,
-- nunca como postgres (que ignora RLS/GRANT). O helper confere que current_user
-- e de fato o papel pedido; se nao pegasse, o teste FALHA em vez de dar verde.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-sh1-audit-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-sh1-audit-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/audit_log_summary_por_periodo.sql
--   docker rm -f zapp-sh1-audit-$$
--
-- VERMELHO (o teste falha quando a correcao nao esta la): acrescente
--   -v sem_funcao=1. Com sem_funcao a migration desta entrega NAO e aplicada,
--   entao as funcoes nao existem e a 1a assercao de comportamento quebra com
--   42883 (undefined_function). Nada persiste: o arquivo termina em ROLLBACK.
--
-- Tudo roda numa unica transacao que termina em ROLLBACK: idempotente, sem
-- efeito colateral e reaplicavel.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superficie minima (ambiente; o contrato vem das migrations logo abaixo) ──
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

SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b');  -- AGENTE

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN AUDIT'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE AUDIT');

SET session_replication_role = origin;

-- ── A PROTECAO, verbatim das migrations reais ────────────────────────────────
\echo '── aplicando as migrations REAIS (audit_logs/user_roles/has_role + a entrega) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\if :{?sem_funcao}
  \echo '  [sem_funcao] a migration desta entrega NAO e aplicada (modo vermelho)'
\else
\i :mig_dir/20261013180000_audit_log_summary.sql
\endif

-- GRANT de tabela do PostgREST (mesmo do ambiente real; a RLS continua a barreira).
GRANT SELECT ON public.profiles TO authenticated, service_role;

-- Papel de admin (depois da policy), com o gatilho de auth.users desligado.
SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent');
SET session_replication_role = origin;

-- ── Fixtures do periodo: 7 linhas de audit_logs, cada KPI com caso proprio ────
-- (ID fixo para poder citar o cursor; datas dentro/fora das janelas de 24h/7d
--  ancoradas em p_to = 2026-06-08 00:00+00)
INSERT INTO public.audit_logs (id, user_id, action, entity_type, details, created_at) VALUES
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-11111111111a', 'login',                'session',    '{"k":"r1"}'::jsonb, '2026-06-02 09:00+00'),
  ('e1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-22222222222b', 'unauthorized_access',  'route',      '{"k":"r2"}'::jsonb, '2026-06-07 10:00+00'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-11111111111a', 'role_granted',         'user_roles', '{"k":"r3"}'::jsonb, '2026-06-07 11:00+00'),
  ('e1000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-22222222222b', 'contact_delete',       'contact',    '{"k":"r4"}'::jsonb, '2026-06-03 08:00+00'),
  ('e1000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-22222222222b', 'export',               'report',     '{"k":"r5"}'::jsonb, '2026-06-04 08:00+00'),
  ('e1000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-22222222222b', 'rls_denied',           'table',      '{"k":"r6"}'::jsonb, '2026-06-07 12:00+00'),
  ('e1000000-0000-0000-0000-000000000007', NULL,                                   'message_sent',         'message',    '{"k":"r7"}'::jsonb, '2026-06-06 08:00+00'),
  ('e1000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-22222222222b', 'login',                'session',    '{"k":"r8"}'::jsonb, '2026-06-07 09:00+00');

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'SH1-audit FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Um unico valor, lido sob o PAPEL REAL (SET LOCAL ROLE) com o JWT de p_uid.
-- Devolve o valor, ou 'ERRO <sqlstate>' — assim uma chamada negada nao aborta.
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'SH1-audit FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v;
END $h$;

-- ── T0: baseline direta (superusuario) == o que o admin vera ─────────────────
\echo
\echo '── T0: estrutura e baseline direto ─────────────────────────────────────'
SELECT pg_temp.espera('T0a total direto no periodo',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE created_at >= '2026-06-01 00:00+00' AND created_at < '2026-06-08 00:00+00'), '8');
SELECT pg_temp.espera('T0b sensiveis direto (role_/delete/export)',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE created_at >= '2026-06-01 00:00+00' AND created_at < '2026-06-08 00:00+00'
      AND (strpos(action,'role_') = 1 OR strpos(action,'delete') > 0
           OR strpos(action,'export') > 0 OR strpos(action,'role_change') > 0)), '3');
SELECT pg_temp.espera('T0c usuarios unicos direto (user_id nao nulo)',
  (SELECT count(DISTINCT user_id)::text FROM public.audit_logs
    WHERE created_at >= '2026-06-01 00:00+00' AND created_at < '2026-06-08 00:00+00'), '2');

\if :{?sem_funcao}
\echo '  [sem_funcao] pulando os auto-testes de estrutura (a funcao nao existe)'
\else
SELECT pg_temp.espera('T0d audit_log_summary e SECURITY DEFINER',
  (SELECT prosecdef::text FROM pg_proc WHERE oid = 'public.audit_log_summary(timestamptz,timestamptz)'::regprocedure), 'true');
SELECT pg_temp.espera('T0e audit_log_list e SECURITY DEFINER',
  (SELECT prosecdef::text FROM pg_proc WHERE oid = 'public.audit_log_list(timestamptz,timestamptz,timestamptz,uuid,integer)'::regprocedure), 'true');
SELECT pg_temp.espera('T0f search_path fixo no resumo',
  (SELECT (proconfig::text LIKE '%search_path=public, pg_temp%')::text FROM pg_proc
    WHERE oid = 'public.audit_log_summary(timestamptz,timestamptz)'::regprocedure), 'true');
SELECT pg_temp.espera('T0g search_path fixo na lista',
  (SELECT (proconfig::text LIKE '%search_path=public, pg_temp%')::text FROM pg_proc
    WHERE oid = 'public.audit_log_list(timestamptz,timestamptz,timestamptz,uuid,integer)'::regprocedure), 'true');
\endif

-- ── BLOCO A: o ADMIN ve os numeros REAIS ────────────────────────────────────
\echo
\echo '── BLOCO A: admin le o resumo real do periodo ──────────────────────────'
SELECT pg_temp.espera('A1 total_logs do admin == baseline',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT total_logs FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '8');
SELECT pg_temp.espera('A2 sensitive_actions do admin == baseline',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT sensitive_actions FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '3');
SELECT pg_temp.espera('A3 unique_users do admin == baseline',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT unique_users FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '2');
SELECT pg_temp.espera('A4 denied_24h = 1 (unauthorized_access na janela)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT denied_24h FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '1');
SELECT pg_temp.espera('A5 permission_changes_24h = 1 (role_granted na janela)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT permission_changes_24h FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '1');
SELECT pg_temp.espera('A6 admin_logins_7d = 1 (login de usuario admin)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT admin_logins_7d FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '1');
SELECT pg_temp.espera('A7 rls_failures_24h = 1 (rls_denied na janela)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT rls_failures_24h FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '1');

-- Carimbo do admin: no periodo ha 2 logins (admin r1 + agente r8), mas o KPI de
-- login administrativo conta APENAS 1 — o login do agente nao infla o numero.
SELECT pg_temp.espera('A8 baseline: 2 logins no periodo (admin + agente)',
  (SELECT count(*)::text FROM public.audit_logs
    WHERE action = 'login' AND created_at >= '2026-06-01 00:00+00' AND created_at < '2026-06-08 00:00+00'), '2');
SELECT pg_temp.espera('A9 admin_logins_7d = 1: so o login do admin conta',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT admin_logins_7d FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00'))::text$q$), '1');

-- ── BLOCO B: fail-closed — agente e anon recebem ZERO linhas ────────────────
\echo
\echo '── BLOCO B: nao-admin recebe vazio (nunca NaN, nunca dado) ─────────────'
SELECT pg_temp.espera('B1 AGENTE: resumo com 0 linhas',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $q$SELECT count(*)::text FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00')$q$), '0');
SELECT pg_temp.espera('B2 AGENTE: lista com 0 linhas',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 50)$q$), '0');
-- Sem oraculo: agente recebe o MESMO vazio para periodo com e sem dado.
SELECT pg_temp.espera('B3 AGENTE: periodo com dado tambem vazio',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $q$SELECT count(*)::text FROM public.audit_log_summary('2026-06-07 00:00+00','2026-06-08 00:00+00')$q$), '0');
SELECT pg_temp.espera('B4 ANON: sem EXECUTE no resumo (42501)',
  pg_temp.valor('anon', NULL,
    $q$SELECT count(*)::text FROM public.audit_log_summary('2026-06-01 00:00+00','2026-06-08 00:00+00')$q$), 'ERRO 42501');
SELECT pg_temp.espera('B5 ANON: sem EXECUTE na lista (42501)',
  pg_temp.valor('anon', NULL,
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 50)$q$), 'ERRO 42501');

-- ── BLOCO C: lista paginada por cursor, com nome do autor ───────────────────
\echo
\echo '── BLOCO C: lista — autor e paginacao por cursor ───────────────────────'
SELECT pg_temp.espera('C1 1a pagina tem 3 linhas (limite)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 3)$q$), '3');
SELECT pg_temp.espera('C2 1a pagina: a mais recente primeiro (rls_denied 12:00)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT action FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 3) LIMIT 1$q$), 'rls_denied');
SELECT pg_temp.espera('C3 actor_name vem de profiles',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT actor_name FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 50) WHERE id = 'e1000000-0000-0000-0000-000000000001'$q$), 'ADMIN AUDIT');
SELECT pg_temp.espera('C4 linha sem autor tem actor_name nulo (nao quebra)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT coalesce(actor_name,'<nulo>') FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 50) WHERE id = 'e1000000-0000-0000-0000-000000000007'$q$), '<nulo>');
-- A 2a pagina parte do cursor (created_at,id) da ULTIMA linha da 1a pagina
-- (r2 = 2026-06-07 10:00). Espera r8 (09:00), r7 (06-06), r5 (06-04).
SELECT pg_temp.espera('C5 2a pagina comeca logo apos o cursor (r8, 09:00)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT id::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', '2026-06-07 10:00+00', 'e1000000-0000-0000-0000-000000000002', 3) LIMIT 1$q$), 'e1000000-0000-0000-0000-000000000008');
SELECT pg_temp.espera('C6 2a pagina tem 3 linhas',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', '2026-06-07 10:00+00', 'e1000000-0000-0000-0000-000000000002', 3)$q$), '3');
-- Sem sobreposicao entre as duas paginas (o cursor nao repete nem pula).
SELECT pg_temp.espera('C7 paginas sem sobreposicao (6 ids distintos)',
  (SELECT count(DISTINCT id)::text FROM (
      SELECT id FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 3)
      UNION ALL
      SELECT id FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', '2026-06-07 10:00+00', 'e1000000-0000-0000-0000-000000000002', 3)
    ) u), '6');
-- Cursor sem id e ignorado (nao devolve pagina vazia por parametro malformado).
SELECT pg_temp.espera('C8 cursor sem id e ignorado (volta a 1a pagina, 3 linhas)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', '2026-06-07 10:00+00', NULL, 3)$q$), '3');

-- ── BLOCO D: entrada invalida nao vira erro ────────────────────────────────
\echo
\echo '── BLOCO D: entrada invalida normalizada ───────────────────────────────'
SELECT pg_temp.espera('D1 periodo invertido -> total 0 (sem erro)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT (SELECT total_logs FROM public.audit_log_summary('2026-06-08 00:00+00','2026-06-01 00:00+00'))::text$q$), '0');
SELECT pg_temp.espera('D2 limite 0 -> normalizado para 1',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 0)$q$), '1');
SELECT pg_temp.espera('D3 limite negativo -> normalizado para 1',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, -5)$q$), '1');
SELECT pg_temp.espera('D4 limite alto -> teto 200 (traz todas as 8)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $q$SELECT count(*)::text FROM public.audit_log_list('2026-06-01 00:00+00','2026-06-08 00:00+00', NULL, NULL, 5000)$q$), '8');

-- ── BLOCO E: ACL ───────────────────────────────────────────────────────────
\echo
\echo '── BLOCO E: ACL por assinatura exata ───────────────────────────────────'
SELECT pg_temp.espera('E1 authenticated TEM EXECUTE no resumo',
  has_function_privilege('authenticated', 'public.audit_log_summary(timestamptz,timestamptz)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('E2 authenticated TEM EXECUTE na lista',
  has_function_privilege('authenticated', 'public.audit_log_list(timestamptz,timestamptz,timestamptz,uuid,integer)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('E3 service_role TEM EXECUTE no resumo',
  has_function_privilege('service_role', 'public.audit_log_summary(timestamptz,timestamptz)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('E4 anon NAO tem EXECUTE no resumo (fail-closed na ACL)',
  has_function_privilege('anon', 'public.audit_log_summary(timestamptz,timestamptz)', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('E5 anon NAO tem EXECUTE na lista',
  has_function_privilege('anon', 'public.audit_log_list(timestamptz,timestamptz,timestamptz,uuid,integer)', 'EXECUTE')::text, 'false');

ROLLBACK;

\echo
\echo 'SH1-audit OK: admin le resumo real + lista paginada com autor; agente/anon'
\echo '             recebem vazio (fail-closed); ACL so para authenticated/service_role.'
