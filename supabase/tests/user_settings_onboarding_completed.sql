-- ============================================================================
-- PD-32 (auditoria de paridade V3 -> V2, docs de estado 04 a 16)
-- "coluna onboarding_completed em user_settings" (cartão t_e73443e1)
--
-- O QUE PROVA (critério de pronto do cartão):
--   1. a coluna public.user_settings.onboarding_completed existe com o contrato
--      pedido — boolean NOT NULL DEFAULT false;
--   2. o BACKFILL documentado na migration funciona: toda linha que JÁ EXISTIA
--      antes da migration vira true (linha criada ao concluir o tour OU ao
--      salvar preferência = "já passou pelo tour"); usuário SEM linha não ganha
--      linha e um INSERT novo recebe o default false;
--   3. EFEITO COLATERAL do backfill tratado: updated_at NÃO muda (o gatilho
--      update_user_settings_updated_at é desligado no backfill) e o gatilho
--      volta LIGADO depois da migration;
--   4. NADA de ACL/policy mudou (a barreira de linha é a RLS, não o GRANT) e as
--      3 policies de linha própria seguem intactas;
--   5. ENFORCEMENT como PAPEL REAL (authenticated / anon / service_role): o
--      dono lê e edita a PRÓPRIA linha e vê o próprio flag; NÃO vê nem escreve a
--      linha de outro (42501/0 linhas); anon não vê nem escreve nada;
--      service_role (BYPASSRLS) vê tudo;
--   6. o ROLLBACK da migration desfaz o estado (coluna some, policies ficam) e a
--      migration reaplica (idempotência).
--
-- COMO A PROTEÇÃO ENTRA NO TESTE: a superfície mínima (roles, schema auth,
-- helper update_updated_at_column) é ENV — criada à mão ou copiada VERBATIM da
-- migration que a define — e o contrato vem das migrations REAIS do repositório,
-- aplicadas por `\i` na ordem cronológica:
--   * 20251220180609_e4bf347a-2e55-4fb6-895b-2164062cccfb.sql (tabela, RLS, 3
--     policies, gatilho updated_at);
--   * 20261013044344_user_settings_onboarding_completed.sql (a correção).
-- Mesmo padrão de supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql.
--
-- ENFORCEMENT exercido como PAPEL REAL: as asserções de RLS rodam com `SET LOCAL
-- ROLE` + JWT sintético em request.jwt.claims — o caminho do PostgREST, nunca
-- como postgres/superusuário (que ignora RLS e GRANT). O helper confere que
-- current_user é de fato o papel pedido; se não pegasse, o teste FALHA.
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-pd32-onb-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-pd32-onb-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/user_settings_onboarding_completed.sql
--   docker rm -f zapp-pd32-onb-$$
--
-- VERMELHO (falha quando a correção não está lá): acrescente `-v sem_guarda=1`.
--   Com sem_guarda a coluna é criada SEM o backfill (correção pela metade) e o
--   teste cai em T2 — é o backfill que ele protege. Nada persiste: termina em
--   ROLLBACK, dentro de uma única transação.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superfície mínima (ambiente; o contrato vem das migrations abaixo) ──────
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

-- Helper do gatilho, VERBATIM de
-- 20251215024517_1c312256-b6e4-4d34-8dc5-3b03301e369e.sql:188-193.
CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Usuários sintéticos: A mexeu em preferências; B só concluiu o tour; C nunca
-- mexeu (fica sem linha). Fixtures entram com o gatilho desligado.
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- A
  ('22222222-2222-2222-2222-22222222222b'),  -- B
  ('33333333-3333-3333-3333-33333333333c');  -- C
SET session_replication_role = origin;

-- ── O contrato da tabela, VERBATIM da migration real ────────────────────────
\echo '── aplicando a migration REAL da tabela (20251220180609: RLS, policies, gatilho) ──'
\i :mig_dir/20251220180609_e4bf347a-2e55-4fb6-895b-2164062cccfb.sql

-- GRANT de tabela do PostgREST: é ele que faz a RLS ser a ÚNICA barreira (T0).
-- O papel anon também recebe GRANT para que o "negado" dele seja obra da RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated, service_role, anon;

-- Fixtures de dados com carimbo ANTIGO: se o backfill mexer em updated_at, T4 cai.
SET session_replication_role = replica;
INSERT INTO public.user_settings (user_id, created_at, updated_at, welcome_message)
  VALUES ('11111111-1111-1111-1111-11111111111a',
          '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'Bom dia!');   -- A: mexeu em preferência
INSERT INTO public.user_settings (user_id, created_at, updated_at)
  VALUES ('22222222-2222-2222-2222-22222222222b',
          '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');               -- B: só concluiu o tour (defaults)
SET session_replication_role = origin;

-- ── Helpers do próprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'PD-32 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'PD-32 FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT de p_uid (null = anon).
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'; o EXCEPTION interno
-- garante que uma operação negada NÃO aborta a transação do teste.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'PD-32 FALHOU: papel real nao aplicado (current_user=%)', current_user;
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

-- Um único valor, lido sob o PAPEL REAL.
CREATE FUNCTION pg_temp.valor(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
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
\echo '── T0: estado ANTES da correção — a barreira é a RLS, não a ACL ────────'
SELECT pg_temp.espera('T0a authenticated TEM SELECT/INSERT/UPDATE na tabela (GRANT do PostgREST)',
  has_table_privilege('authenticated', 'public.user_settings', 'SELECT,INSERT,UPDATE')::text, 'true');
SELECT pg_temp.espera('T0b anon TAMBÉM tem GRANT (o "negado" dele será a RLS)',
  has_table_privilege('anon', 'public.user_settings', 'SELECT,INSERT,UPDATE')::text, 'true');
SELECT pg_temp.espera('T0c a coluna onboarding_completed AINDA NÃO existe (a correção é nova)',
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings'
      AND column_name = 'onboarding_completed'), '0');
SELECT pg_temp.espera('T0d RLS ligada na tabela',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.user_settings'::regclass), 'true');
SELECT pg_temp.espera('T0e duas linhas de fixture antes da migration',
  (SELECT count(*)::text FROM public.user_settings), '2');

-- ── Modo vermelho: a correção pela metade (coluna sem backfill) ─────────────
\if :{?sem_guarda}
  ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
  \echo '  [sem_guarda] coluna criada SEM o backfill: T2 deve falhar'
\else
  \echo '── aplicando a migration REAL da correção (20261013044344) ──'
  \i :mig_dir/20261013044344_user_settings_onboarding_completed.sql
\endif

\echo
\echo '── T1: a coluna com o contrato pedido ──────────────────────────────────'
SELECT pg_temp.espera('T1a tipo boolean',
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings'
      AND column_name = 'onboarding_completed'), 'boolean');
SELECT pg_temp.espera('T1b NOT NULL',
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings'
      AND column_name = 'onboarding_completed'), 'NO');
SELECT pg_temp.espera('T1c DEFAULT false (linha nova nasce "não concluído")',
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings'
      AND column_name = 'onboarding_completed'), 'false');

\echo
\echo '── T2: BACKFILL — linha que já existia vira true ───────────────────────'
SELECT pg_temp.espera('T2a usuário que mexeu em preferência (A) -> true',
  (SELECT onboarding_completed::text FROM public.user_settings
    WHERE user_id = '11111111-1111-1111-1111-11111111111a'), 'true');
SELECT pg_temp.espera('T2b usuário que só concluiu o tour (B) -> true',
  (SELECT onboarding_completed::text FROM public.user_settings
    WHERE user_id = '22222222-2222-2222-2222-22222222222b'), 'true');
SELECT pg_temp.espera('T2c todas as linhas existentes foram backfilladas',
  (SELECT count(*)::text FROM public.user_settings WHERE onboarding_completed), '2');
SELECT pg_temp.espera('T2d nenhuma linha ficou false',
  (SELECT count(*)::text FROM public.user_settings WHERE NOT onboarding_completed), '0');

\echo
\echo '── T3: usuário SEM linha continua sem linha; INSERT novo = default false ─'
SELECT pg_temp.espera('T3a C não ganhou linha no backfill',
  (SELECT count(*)::text FROM public.user_settings
    WHERE user_id = '33333333-3333-3333-3333-33333333333c'), '0');
INSERT INTO public.user_settings (user_id) VALUES ('33333333-3333-3333-3333-33333333333c');
SELECT pg_temp.espera('T3b INSERT novo (sem a coluna) recebe false, não true',
  (SELECT onboarding_completed::text FROM public.user_settings
    WHERE user_id = '33333333-3333-3333-3333-33333333333c'), 'false');

\echo
\echo '── T4: efeito colateral — o backfill NÃO reescreveu updated_at ──────────'
SELECT pg_temp.espera('T4a updated_at de A intacto',
  (SELECT (updated_at = '2026-01-01T00:00:00Z'::timestamptz)::text FROM public.user_settings
    WHERE user_id = '11111111-1111-1111-1111-11111111111a'), 'true');
SELECT pg_temp.espera('T4b updated_at de B intacto',
  (SELECT (updated_at = '2026-01-02T00:00:00Z'::timestamptz)::text FROM public.user_settings
    WHERE user_id = '22222222-2222-2222-2222-22222222222b'), 'true');
SELECT pg_temp.espera('T4c created_at de A intacto',
  (SELECT (created_at = '2026-01-01T00:00:00Z'::timestamptz)::text FROM public.user_settings
    WHERE user_id = '11111111-1111-1111-1111-11111111111a'), 'true');

\echo
\echo '── T5: gatilho religado e policies intactas (nada de ACL/policy mudou) ──'
SELECT pg_temp.espera('T5a gatilho update_user_settings_updated_at LIGADO',
  (SELECT tgenabled::text FROM pg_trigger WHERE tgname = 'update_user_settings_updated_at'), 'O');
SELECT pg_temp.espera('T5b RLS segue ligada',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.user_settings'::regclass), 'true');
SELECT pg_temp.espera('T5c as 3 policies de linha própria continuam',
  (SELECT count(*)::text FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_settings'), '3');

\echo
\echo '── BLOCO A: PAPEL REAL authenticated — o dono passa, o outro é negado ──'
-- A lê o PRÓPRIO flag: caminho real do PostgREST
SELECT pg_temp.espera('T6 A lê o próprio onboarding_completed',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT onboarding_completed::text FROM public.user_settings
         WHERE user_id = '11111111-1111-1111-1111-11111111111a'$sql$), 'true');
-- A edita a PRÓPRIA linha (policy UPDATE USING auth.uid() = user_id): passa
SELECT pg_temp.espera('T7 A atualiza a própria linha (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.user_settings SET onboarding_completed = false
         WHERE user_id = '11111111-1111-1111-1111-11111111111a'$sql$), 'OK 1');
-- ...e a RLS barra a linha de OUTRO: 0 linhas
SELECT pg_temp.espera('T8 A NÃO vê a linha de B (RLS de leitura)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.user_settings
         WHERE user_id = '22222222-2222-2222-2222-22222222222b'$sql$), '0');
SELECT pg_temp.espera('T9 A NÃO atualiza a linha de B (0 linhas)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.user_settings SET onboarding_completed = false
         WHERE user_id = '22222222-2222-2222-2222-22222222222b'$sql$), 'OK 0');
SELECT pg_temp.espera('T10 A NÃO insere linha para B (WITH CHECK -> 42501)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.user_settings (user_id) VALUES ('22222222-2222-2222-2222-22222222222b')$sql$),
  'ERRO 42501 new row violates row-level security policy for table "user_settings"');
SELECT pg_temp.espera('T11 o flag de B segue true (nada vazou do T9/T10)',
  (SELECT onboarding_completed::text FROM public.user_settings
    WHERE user_id = '22222222-2222-2222-2222-22222222222b'), 'true');

\echo
\echo '── BLOCO B: anon e service_role ────────────────────────────────────────'
SELECT pg_temp.espera('T12 anon NÃO vê nenhuma linha',
  pg_temp.valor('anon', null,
    $sql$SELECT count(*)::text FROM public.user_settings$sql$), '0');
SELECT pg_temp.espera('T13 anon NÃO insere (42501)',
  pg_temp.operacao('anon', null,
    $sql$INSERT INTO public.user_settings (user_id) VALUES ('33333333-3333-3333-3333-33333333333c')$sql$),
  'ERRO 42501 new row violates row-level security policy for table "user_settings"');
SELECT pg_temp.espera('T14 anon NÃO atualiza nenhuma linha (0 linhas)',
  pg_temp.operacao('anon', null,
    $sql$UPDATE public.user_settings SET onboarding_completed = true$sql$), 'OK 0');
SELECT pg_temp.espera('T15 service_role (BYPASSRLS) vê as 3 linhas',
  pg_temp.valor('service_role', null,
    $sql$SELECT count(*)::text FROM public.user_settings$sql$), '3');

\echo
\echo '── BLOCO R: o rollback da migration desfaz, e a migration reaplica ──────'
-- As duas sentenças abaixo são o bloco `-- Rollback (SQL executável, na ordem):` do
-- topo da migration, verbatim.
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS onboarding_completed;
ALTER TABLE public.user_settings ENABLE TRIGGER update_user_settings_updated_at;
SELECT pg_temp.espera('T16 rollback: a coluna sumiu',
  (SELECT count(*)::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings'
      AND column_name = 'onboarding_completed'), '0');
SELECT pg_temp.espera('T17 rollback: as 3 policies ficaram intactas (sem resíduo)',
  (SELECT count(*)::text FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_settings'), '3');
SELECT pg_temp.espera('T18 rollback: o gatilho segue ligado',
  (SELECT tgenabled::text FROM pg_trigger WHERE tgname = 'update_user_settings_updated_at'), 'O');

\echo '── reaplicando a migration (idempotência) ──'
\i :mig_dir/20261013044344_user_settings_onboarding_completed.sql
SELECT pg_temp.espera('T19 reaplicada: coluna voltou com o contrato',
  (SELECT data_type || '/' || is_nullable || '/' || column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings'
      AND column_name = 'onboarding_completed'), 'boolean/NO/false');
SELECT pg_temp.espera('T20 reaplicada: o backfill marcou as linhas existentes como true',
  (SELECT count(*)::text FROM public.user_settings WHERE onboarding_completed), '3');

ROLLBACK;

\echo
\echo 'PD-32 OK: coluna boolean NOT NULL DEFAULT false; backfill true para as linhas'
\echo '         existentes (updated_at preservado, gatilho religado); RLS a única'
\echo '         barreira — dono passa, outro é negado, anon 100% negado, service_role vê'
\echo '         tudo; rollback desfaz e a migration reaplica.'
