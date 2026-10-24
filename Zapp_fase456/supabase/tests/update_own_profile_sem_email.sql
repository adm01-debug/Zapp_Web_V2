-- ============================================================================
-- R2-DB-030 (P2) — "perfil proprio nao altera o e-mail sem validacao".
-- Cartao t_98d68615. Correcao: supabase/migrations/20261014023945_update_own_profile_sem_email.sql
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) ANTES da correcao (so as migrations reais ja versionadas): a assinatura de
--      6 parametros (com p_email) EXISTE e o corpo herdado aponta para a coluna
--      profiles.display_name, que NAO existe — a funcao estoura 42703 em qualquer
--      chamada e o e-mail fica no contrato sem que o RPC seja um caminho vivo;
--      o e-mail so poderia ser trocado por fora do Auth por essa porta aberta;
--   B) DEPOIS da migration: a assinatura de 6 parametros (com p_email) NAO existe
--      mais — chamar com e-mail falha em 42883 (funcao inexistente) e o e-mail
--      nao muda (nao ha "falha silenciosa" nem gravacao parcial);
--   C) o caminho legitimo fica VIVO: authenticated chama o RPC de 5 parametros e
--      os campos nao sensiveis (name_do_perfil, phone, birthday) mudam;
--   D) entrada invalida nao deixa efeito parcial (birthday 'ontem' -> 22007 e nada muda);
--   E) ACL fechada: o antigo EXECUTE herdado de PUBLIC (default do Postgres na
--      migration antiga) some — anon passa a receber 42501, PUBLIC nao tem EXECUTE
--      e so authenticated/service_role executam;
--   F) efeito colateral: o UPDATE dispara o gatilho REAL prevent_privilege_escalation,
--      nao toca role/permissions/access_level e nao alcanca a linha de outro usuario
--      (o RPC age so no proprio auth.uid()).
--
-- O AMBIENTE bate com o schema REAL (conferido em supabase/schema-catalog.json:
--   profiles.name text NOT NULL, profiles.birthday date, SEM coluna display_name).
--   O ambiente minimo (roles, schema auth, tabelas, enum) eh criado ah mao — isso eh
--   ambiente, nao contrato — e a PROTECAO entra VERBATIM dos arquivos de migration
--   do repositorio, via \i, em ordem cronologica. Mesmo padrao de
--   supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql.
--
-- ENFORCEMENT como PAPEL REAL: as assercoes rodam com SET LOCAL ROLE
-- authenticated/anon/service_role + JWT sintetico em request.jwt.claims — o caminho
-- do PostgREST, nunca como postgres (que ignora GRANT). O helper confere dentro que
-- current_user eh de fato o papel pedido: se o papel nao pegasse, o teste FALHA.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo montado somente-leitura):
--   docker run --rm -d --name zapp-r2db030 -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-r2db030 psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_dir=/repo/supabase/migrations \
--     -f - < supabase/tests/update_own_profile_sem_email.sql
--   docker rm -f zapp-r2db030
--
-- VERMELHO (as assercoes mordem): acrescente `-v sem_correcao=1`. A migration nova
-- eh PULADA, o RPC de 6 parametros continua vivo e as assercoes do BLOCO B falham
-- (B1). Tudo roda numa unica transacao que termina em ROLLBACK: idempotente,
-- sem efeito colateral e reaplicavel.
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

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'special_agent', 'agent');

-- Espelha o schema REAL de public.profiles (colunas usadas pelo RPC e pela guarda).
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  avatar_url text,
  phone text,
  email text,
  signature text,
  birthday date,
  role text NOT NULL DEFAULT 'agent',
  permissions jsonb NOT NULL DEFAULT '{}',
  access_level text NOT NULL DEFAULT 'basic',
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
-- Dependencias das migrations reais que este teste aplica.
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assigned_to uuid);
CREATE TABLE public.conversation_sla (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid);
CREATE TABLE public.rate_limit_configs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.blocked_ips (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.login_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.user_devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;

INSERT INTO public.profiles (id, user_id, name, email, phone) VALUES
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003',
   'Agente', 'original@example.com', '11900000000'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004',
   'Alvo', 'alvo@example.com', '11900000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000003', 'agent');

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ─────────
\echo '── aplicando as migrations REAIS (guarda de profiles + estado anterior do RPC) ──'
\i :mig_dir/20260318121449_24b7aa75-6b70-4eb0-80e0-ba5b9bcc0220.sql
\i :mig_dir/20260404170153_bd513d5d-4f25-4f46-b2b6-496d4fbc815b.sql
\i :mig_dir/20260830070000_fn_effective_role_and_sync_trigger.sql
\i :mig_dir/20260830080000_fn_is_admin_and_fix_permissions_rls.sql
\i :mig_dir/20260830161547_fix_prevent_privilege_escalation_allow_internal_sync.sql

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'R2-DB-030 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'R2-DB-030 FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT do usuario p_uid.
-- Devolve 'OK <valor>' ou 'ERRO <sqlstate> <mensagem>'.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_val text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'R2-DB-030 FALHOU: papel real nao aplicado (current_user=%)', current_user;
  END IF;
  BEGIN
    EXECUTE p_sql INTO v_val;
    v_ret := 'OK ' || coalesce(v_val, '<null>');
  EXCEPTION WHEN OTHERS THEN
    v_ret := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_ret;
END $h$;

\echo
\echo '── BLOCO A: estado anterior (assinatura com p_email + corpo apontando p/ coluna inexistente) ──'
SELECT pg_temp.espera('A1 a assinatura de 6 parametros (com p_email) existe no estado anterior',
  (to_regprocedure('public.update_own_profile(text,text,text,text,text,text)') IS NOT NULL)::text, 'true');
SELECT pg_temp.espera_erro('A2 o RPC herdado estoura em qualquer chamada (coluna display_name inexistente)',
  pg_temp.operacao('authenticated', '20000000-0000-0000-0000-000000000003',
    $sql$SELECT public.update_own_profile('Nome Invasor', NULL, NULL, 'invasor@example.com', NULL, NULL)::text$sql$),
  '42703');
SELECT pg_temp.espera('A3 o e-mail nao foi tocado (nada de gravacao parcial)',
  (SELECT email FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'original@example.com');

-- ── A CORRECAO, aplicada verbatim e uma vez ────────────────────────────────
\if :{?sem_correcao}
  \echo '  [sem_correcao] migration 20261014023945 PULADA — as assercoes do BLOCO B devem falhar'
\else
  \i :mig_dir/20261014023945_update_own_profile_sem_email.sql
  \echo '  migration 20261014023945_update_own_profile_sem_email aplicada'
\endif

\echo
\echo '── BLOCO B: o e-mail so muda pelo Auth (a assinatura com p_email morreu) ──'
SELECT pg_temp.espera('B1 a assinatura de 6 parametros (com p_email) NAO existe mais',
  (to_regprocedure('public.update_own_profile(text,text,text,text,text,text)') IS NOT NULL)::text, 'false');
SELECT pg_temp.espera('B2 a assinatura viva tem 5 parametros e nenhum p_email',
  (SELECT (pg_get_function_arguments(oid) NOT LIKE '%p_email%')::text
     FROM pg_proc WHERE oid = 'public.update_own_profile(text,text,text,text,text)'::regprocedure), 'true');

-- T1 — o caminho antigo do hook deixa de existir (42883), nao "falha silenciosa"
SELECT pg_temp.espera_erro('T1 authenticated nao consegue mais passar e-mail ao RPC',
  pg_temp.operacao('authenticated', '20000000-0000-0000-0000-000000000003',
    $sql$SELECT public.update_own_profile('Nome Invasor', NULL, NULL, 'invasor@example.com', NULL, NULL)::text$sql$),
  '42883');
SELECT pg_temp.espera('T1b o e-mail NAO mudou com a chamada recusada',
  (SELECT email FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'original@example.com');

-- T2 — o caminho legitimo fica VIVO (era 42703; agora atualiza os campos nao sensiveis)
SELECT pg_temp.espera('T2 authenticated atualiza os campos nao sensiveis (true)',
  pg_temp.operacao('authenticated', '20000000-0000-0000-0000-000000000003',
    $sql$SELECT public.update_own_profile('Nome Legitimo', NULL, '11988887777', 'Assinatura', '2026-10-14')::text$sql$),
  'OK true');
SELECT pg_temp.espera('T2b profiles.name mudou',
  (SELECT name FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'Nome Legitimo');
SELECT pg_temp.espera('T2c phone mudou',
  (SELECT phone FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  '11988887777');
SELECT pg_temp.espera('T2d birthday TEXT virou DATE sem estourar',
  (SELECT birthday::text FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  '2026-10-14');
SELECT pg_temp.espera('T2e o e-mail continua o mesmo depois do update legitimo',
  (SELECT email FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'original@example.com');

-- T3 — entrada invalida nao deixa efeito parcial (atomicidade da unica UPDATE)
SELECT pg_temp.espera_erro('T3 birthday invalido estoura 22007',
  pg_temp.operacao('authenticated', '20000000-0000-0000-0000-000000000003',
    $sql$SELECT public.update_own_profile('Nome Invalido', NULL, NULL, NULL, 'ontem')::text$sql$),
  '22007');
SELECT pg_temp.espera('T3b nada mudou depois do erro (name e birthday intactos)',
  (SELECT name || '|' || birthday::text FROM public.profiles
    WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'Nome Legitimo|2026-10-14');

-- T4 — escopo: o RPC age SO na linha do proprio auth.uid()
SELECT pg_temp.espera('T4 a linha do outro usuario ficou intacta',
  (SELECT name || '|' || phone || '|' || email FROM public.profiles
    WHERE user_id = '20000000-0000-0000-0000-000000000004'),
  'Alvo|11900000001|alvo@example.com');

-- T5 — ACL: o EXECUTE herdado de PUBLIC foi fechado; anon recebe 42501
SELECT pg_temp.espera('T5 anon nao executa o RPC (42501)',
  pg_temp.operacao('anon', NULL,
    $sql$SELECT public.update_own_profile('Nome Legitimo', NULL, '11988887777', NULL, NULL)::text$sql$),
  'ERRO 42501 permission denied for function update_own_profile');
SELECT pg_temp.espera('T5b authenticated TEM EXECUTE',
  has_function_privilege('authenticated',
    'public.update_own_profile(text,text,text,text,text)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('T5c anon NAO tem EXECUTE',
  has_function_privilege('anon',
    'public.update_own_profile(text,text,text,text,text)', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('T5d service_role TEM EXECUTE',
  has_function_privilege('service_role',
    'public.update_own_profile(text,text,text,text,text)', 'EXECUTE')::text, 'true');
SELECT pg_temp.espera('T5e o RPC segue SECURITY DEFINER e com search_path fixo',
  (SELECT (prosecdef AND array_to_string(proconfig, ',') LIKE '%search_path=public%')::text
     FROM pg_proc WHERE oid = 'public.update_own_profile(text,text,text,text,text)'::regprocedure), 'true');

-- T6 — efeito colateral: o gatilho REAL de privilegio dispara e deixa passar
SELECT pg_temp.espera('T6 o UPDATE do RPC nao escalou papel/permissao/access_level',
  (SELECT role || '|' || permissions::text || '|' || access_level FROM public.profiles
    WHERE user_id = '20000000-0000-0000-0000-000000000003'), 'agent|{}|basic');
SELECT pg_temp.espera('T6b a guarda de privilegio continua armada em profiles',
  (SELECT count(*)::text FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'prevent_privilege_escalation' AND NOT tgisinternal), '1');

ROLLBACK;

\echo
\echo 'R2-DB-030 OK: antes, o RPC tinha p_email e corpo quebrado (display_name inexistente);'
\echo '            depois, a assinatura p_email morreu, o e-mail nao muda, o caminho legitimo'
\echo '            voltou a funcionar em schema real, anon perde o EXECUTE e a guarda segue armada.'
