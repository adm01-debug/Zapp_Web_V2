-- ============================================================================
-- fix(db): configuracoes globais — supervisor NAO le nem altera chaves secretas
-- Cartao t_3dd47b33 (workersql). Origem: auditoria de paridade V3->V2 (parte 6).
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) no estado ANTES do conserto (a policy larga 'Admins can manage global
--      settings' FOR ALL com is_admin_or_supervisor ainda viva), o SUPERVISOR
--      le e ALTERA as chaves secretas — o defeito descrito no cartao;
--   B) DEPOIS da migration <ts>_global_settings_secrets:
--        B1 o SUPERVISOR nao ve nenhuma chave secreta (as que terminam em
--           _api_key, _secret ou _token) e continua vendo as demais;
--        B2 o ADMIN ve e altera tudo;
--        B3 o papel comum (authenticated sem admin/supervisor) NEM o anonimo
--           ve nada;
--        B4 nenhuma policy de escrita de global_settings aceita supervisor;
--        B5 os valores nao secretos ficam intactos (nenhum dado perdido);
--        B6/E reaplicar a migration nao muda nada (idempotente);
--        D  o rollback do proprio arquivo roda verbatim e reexpoe o segredo ao
--           supervisor (inverso de verdade, nao de fachada).
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superficie minima (roles, schema auth, tabelas e a publicacao) e criada a
-- mao — e ambiente, nao contrato — e a PROTECAO e aplicada VERBATIM dos arquivos
-- de migration do repositorio, via `\i`, na ordem cronologica:
--   20251215025014 -> app_role, user_roles, has_role(), is_admin_or_supervisor()
--   20260830080000 -> is_admin()
--   20260315193759 -> tabela global_settings + as policies originais
--                     ('Anyone can view global settings' USING(true) e
--                      'Admins can manage global settings' FOR ALL is_admin_or_supervisor)
--   <ts>_global_settings_secrets -> a migration sob teste (o conserto)
-- Mesmo padrao de supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql
-- (N-001), r2_db_022_provenance_trigger.sql e scripts/db-audit/dashboard-rls-authorization.test.sh.
--
-- ENFORCEMENT exercido como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated` (e anon) + JWT sintetico em request.jwt.claims — o caminho do
-- PostgREST, nunca como postgres/superusuario (que ignora RLS e GRANT). Cada
-- operacao confere dentro do helper que current_user e de fato o papel pedido:
-- se o papel nao pegasse, o teste FALHA em vez de dar verde.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-gs-secrets-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-gs-secrets-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/global_settings_secrets_rls.sql
--   docker rm -f zapp-gs-secrets-$$
--
-- VERMELHO (o teste falha quando o conserto nao esta la):
--   `-v sem_conserto=1` — a migration sob teste NAO e aplicada; o BLOCO B cai na
--   primeira assercao (supervisor enxerga o segredo). Nada persiste: o arquivo
--   termina em ROLLBACK.
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
CREATE TABLE public.queues (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
-- permissions/role_permissions sao tocados por 20260830080000 (DROP/CREATE policy):
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ── Administrador: as fixtures entram sem disparar o sino de auth.users ──────
SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b'),  -- AGENTE
  ('44444444-4444-4444-4444-44444444444d');  -- SUPERVISOR

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN GS'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE GS'),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-44444444444d', 'SUPERVISOR GS');

SET session_replication_role = origin;

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ──────────
\echo '── aplicando as migrations REAIS (helpers + global_settings original) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20260830080000_fn_is_admin_and_fix_permissions_rls.sql
\i :mig_dir/20260315193759_ad5f45ba-4b9f-4b25-b483-7da8b548e8c7.sql

-- GRANT de tabela do PostgREST: e ele que faz a RLS ser a UNICA barreira (T0).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_settings TO authenticated, service_role;
GRANT SELECT ON public.global_settings TO anon;
GRANT SELECT ON public.profiles, public.user_roles TO authenticated, service_role;

-- Fixtures de papel (depois das policies, com o gatilho de auth.users desligado).
SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent'),
  ('44444444-4444-4444-4444-44444444444d', 'supervisor');

-- Chaves secretas extras (as que terminam em _api_key/_secret/_token). A
-- migration original ja semeia 'api_token' (secreta, valor ''). Como postgres,
-- o INSERT ignora RLS de proposito — sao dados de ambiente.
INSERT INTO public.global_settings (key, value, description) VALUES
  ('elevenlabs_api_key',    'SEGREDO-ELEVEN', 'Chave ElevenLabs'),
  ('zapp_client_secret',    'SEGREDO-SECRET', 'Segredo de cliente'),
  ('whatsapp_bot_token',    'SEGREDO-TOKEN',  'Token do bot')
ON CONFLICT (key) DO NOTHING;
SET session_replication_role = origin;

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'GS-SECRETS FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'GS-SECRETS FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT do usuario p_uid.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'GS-SECRETS FALHOU: papel real nao aplicado (current_user=%)', current_user;
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

-- Um unico valor, lido sob o PAPEL REAL (controles de leitura).
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
\echo '── T0: a barreira e a RLS, nao a ACL ───────────────────────────────────'
SELECT pg_temp.espera('T0 authenticated TEM SELECT/INSERT/UPDATE/DELETE na tabela (GRANT do PostgREST)',
  has_table_privilege('authenticated', 'public.global_settings', 'SELECT,INSERT,UPDATE,DELETE')::text, 'true');
SELECT pg_temp.espera('T0b anon TEM SELECT (o que barra e a policy, nao o GRANT)',
  has_table_privilege('anon', 'public.global_settings', 'SELECT')::text, 'true');
SELECT pg_temp.espera('T0c RLS ligada em global_settings',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.global_settings'::regclass), 'true');
SELECT pg_temp.espera('T0d a fixture tem 8 chaves (4 secretas, 4 nao secretas)',
  (SELECT count(*)::text FROM public.global_settings), '8');

-- ── Modo vermelho: sem a migration, o defeito fica de pe ─────────────────────
\if :{?sem_conserto}
  \echo '  [sem_conserto] a migration sob teste NAO sera aplicada (dentro da transacao)'
\else
  \echo '── aplicando a migration SOB TESTE (o conserto) ──'
  \i :mig_dir/20261011192905_global_settings_secrets.sql
\endif

\echo
\echo '── BLOCO A: o SUPERVISOR le e altera chaves secretas — o defeito ───────'
-- Estas assercoes descrevem o estado ORIGINAL (antes do conserto). No modo
-- default elas ja rodam DEPOIS do conserto, entao o que se cobra aqui e o
-- contrato final; no modo sem_conserto elas documentam o defeito vivo.
\if :{?sem_conserto}
  SELECT pg_temp.espera('A1 [defeito vivo] supervisor LE a chave secreta elevenlabs_api_key',
    pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
      $sql$SELECT count(*)::text FROM public.global_settings WHERE key = 'elevenlabs_api_key'$sql$), '1');
  SELECT pg_temp.espera('A2 [defeito vivo] supervisor ALTERA a chave secreta (1 linha)',
    pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
      $sql$UPDATE public.global_settings SET value = 'INVADIDO' WHERE key = 'elevenlabs_api_key'$sql$), 'OK 1');
\else
  SELECT pg_temp.espera('A1 [pos-conserto] supervisor NAO le a chave secreta',
    pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
      $sql$SELECT count(*)::text FROM public.global_settings WHERE key = 'elevenlabs_api_key'$sql$), '0');
  SELECT pg_temp.espera('A2 [pos-conserto] supervisor NAO altera a chave secreta (0 linhas)',
    pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
      $sql$UPDATE public.global_settings SET value = 'INVADIDO' WHERE key = 'elevenlabs_api_key'$sql$), 'OK 0');
\endif

\echo
\echo '── BLOCO B: contrato apos o conserto — supervisor, admin, agente, anon ─'

-- B1 — o supervisor ve APENAS as chaves nao secretas (4 de 8)
SELECT pg_temp.espera('B1a supervisor ve as 4 chaves nao secretas',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.global_settings
        WHERE key !~ '(_api_key|_secret|_token)$'$sql$), '4');
SELECT pg_temp.espera('B1b supervisor ve 0 das 4 chaves secretas',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.global_settings WHERE key ~ '(_api_key|_secret|_token)$'$sql$), '0');
SELECT pg_temp.espera('B1c supervisor nao ve a chave secreta pelo nome',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.global_settings WHERE key IN ('api_token','elevenlabs_api_key','zapp_client_secret','whatsapp_bot_token')$sql$), '0');
SELECT pg_temp.espera('B1d supervisor enxerga a chave nao secreta pelo nome',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.global_settings WHERE key = 'auto_reopen_hours'$sql$), '1');

-- B2 — o admin ve tudo e altera a chave secreta
SELECT pg_temp.espera('B2a admin ve as 8 chaves',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.global_settings$sql$), '8');
SELECT pg_temp.espera('B2b admin ve a chave secreta elevenlabs_api_key',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.global_settings WHERE key = 'elevenlabs_api_key'$sql$), '1');
SELECT pg_temp.espera('B2c admin ALTERA a chave secreta (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.global_settings SET value = 'TROCADO-PELO-ADMIN' WHERE key = 'elevenlabs_api_key'$sql$), 'OK 1');
SELECT pg_temp.espera('B2d o valor novo do admin pegou',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT value FROM public.global_settings WHERE key = 'elevenlabs_api_key'$sql$), 'TROCADO-PELO-ADMIN');

-- B3 — agente comum e anonimo NAO veem nada
SELECT pg_temp.espera('B3a agente comum ve 0 chaves',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT count(*)::text FROM public.global_settings$sql$), '0');
SELECT pg_temp.espera('B3b anonimo ve 0 chaves',
  pg_temp.valor('anon', NULL,
    $sql$SELECT count(*)::text FROM public.global_settings$sql$), '0');

-- B4 — a escrita: supervisor nao INSERT/DELETE; o admin sim
SELECT pg_temp.espera_erro('B4a supervisor nao INSERT chave secreta (42501)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$INSERT INTO public.global_settings (key, value) VALUES ('nova_api_key','X')$sql$), '42501');
SELECT pg_temp.espera('B4b supervisor DELETE de chave secreta nao apaga nada (0 linhas)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$DELETE FROM public.global_settings WHERE key = 'whatsapp_bot_token'$sql$), 'OK 0');
SELECT pg_temp.espera('B4c a chave secreta continua existindo',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.global_settings WHERE key = 'whatsapp_bot_token'$sql$), '1');
SELECT pg_temp.espera('B4d admin INSERT chave nao secreta (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.global_settings (key, value) VALUES ('nova_opcao','ok')$sql$), 'OK 1');

-- B5 — B4d prova que os INSERTs do teste entraram (o total nunca subiu antes);
--      a chave nao secreta original segue intacta (nenhum dado perdido).
SELECT pg_temp.espera('B5a o start das chaves permanece (4 nao secretas originais)',
  (SELECT count(*)::text FROM public.global_settings
     WHERE key IN ('user_creation','check_msg_is_group','auto_reopen_hours','group_tickets_enabled')), '4');
SELECT pg_temp.espera('B5b nenhuma tentativa negada criou chave espuria',
  (SELECT count(*)::text FROM public.global_settings WHERE key = 'nova_api_key'), '0');

-- B6 — retrato das policies: exatamente 2; a de escrita e is_admin; a de leitura exclui segredo
SELECT pg_temp.espera('B6a global_settings tem exatamente 2 policies',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='global_settings'), '2');
SELECT pg_temp.espera('B6b a unica policy de escrita (FOR ALL) e is_admin, com WITH CHECK',
  (SELECT count(*)::text FROM pg_policies
     WHERE schemaname='public' AND tablename='global_settings' AND cmd='ALL'
       AND qual LIKE '%is_admin(%' AND qual NOT LIKE '%is_admin_or_supervisor%'
       AND with_check LIKE '%is_admin(%'), '1');
SELECT pg_temp.espera('B6c a policy de leitura nao deixa o supervisor ver chave secreta',
  (SELECT count(*)::text FROM pg_policies
     WHERE schemaname='public' AND tablename='global_settings' AND cmd='SELECT'
       AND position('_api_key' in qual) > 0
       AND qual LIKE '%is_admin_or_supervisor(%'), '1');
SELECT pg_temp.espera('B6d nenhuma policy de escrita aceita supervisor (is_admin_or_supervisor)',
  (SELECT count(*)::text FROM pg_policies
     WHERE schemaname='public' AND tablename='global_settings'
       AND cmd <> 'SELECT' AND qual LIKE '%is_admin_or_supervisor%'), '0');
SELECT pg_temp.espera('B6e nao ha resquicio da policy larga "Anyone can view global settings"',
  (SELECT count(*)::text FROM pg_policies
     WHERE schemaname='public' AND tablename='global_settings' AND policyname = 'Anyone can view global settings'), '0');

\echo
\echo '── BLOCO C: efeito colateral — nada fora de global_settings foi tocado ──'
SELECT pg_temp.espera('C1 a policy de escrita nao mudou o GRANT (authenticated segue com DML)',
  has_table_privilege('authenticated', 'public.global_settings', 'SELECT,INSERT,UPDATE,DELETE')::text, 'true');
SELECT pg_temp.espera('C2 a migration nao criou tabela nova',
  (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '%secret%'), '0');

\echo
\echo '── BLOCO E: reaplicar a migration nao muda o resultado (idempotente) ────'
\if :{?sem_conserto}
  \echo '  [sem_conserto] nada a idempotenciar'
\else
  \i :mig_dir/20261011192905_global_settings_secrets.sql
  SELECT pg_temp.espera('E1 apos reaplicar, seguem 2 policies',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='global_settings'), '2');
  SELECT pg_temp.espera('E2 apos reaplicar, supervisor continua sem ver segredo',
    pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
      $sql$SELECT count(*)::text FROM public.global_settings WHERE key ~ '(_api_key|_secret|_token)$'$sql$), '0');
\endif

\echo
\echo '── BLOCO D: o rollback da migration e executavel e e o inverso de verdade ─'
-- Le as linhas "--   <stmt>;" do proprio arquivo da migration (verbatim, sem
-- copia a mao) e executa. Depois prova que o estado ANTERIOR volta: o supervisor
-- volta a enxergar o segredo — ou seja, o rollback desfaz o conserto de fato.
\if :{?sem_conserto}
  \echo '  [sem_conserto] sem conserto nao ha rollback a provar'
\else
DO $bloco$
DECLARE
  v_txt  text := pg_read_file('/repo/supabase/migrations/20261011192905_global_settings_secrets.sql');
  v_stmt text;
  v_n    int := 0;
BEGIN
  FOR v_stmt IN
    SELECT regexp_replace(btrim(l, E' \t'), '^--[[:space:]]+', '')
      FROM unnest(string_to_array(v_txt, E'\n')) AS l
     WHERE btrim(l, E' \t') ~* '^--[[:space:]]+(drop|create|alter|grant|revoke|insert|update|delete|comment|select)[[:space:]]'
  LOOP
    EXECUTE v_stmt;
    v_n := v_n + 1;
  END LOOP;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'GS-SECRETS FALHOU: rollback do arquivo trouxe % statements (esperava 4)', v_n;
  END IF;
  RAISE NOTICE 'PASS [D1 rollback executado verbatim do arquivo] -> % statements', v_n;
END
$bloco$;
SELECT pg_temp.espera('D2 o rollback reexpoe o segredo ao supervisor (inverso real)',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.global_settings WHERE key ~ '(_api_key|_secret|_token)$'$sql$), '4');
SELECT pg_temp.espera('D3 o rollback restaura o estado do Gate 16: escrita ja era so do admin (0 linhas)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$UPDATE public.global_settings SET value = 'APOS-ROLLBACK' WHERE key = 'zapp_client_secret'$sql$), 'OK 0');
SELECT pg_temp.espera('D3b a tentativa negada nao mudou o valor',
  (SELECT count(*)::text FROM public.global_settings WHERE key = 'zapp_client_secret' AND value = 'SEGREDO-SECRET'), '1');
SELECT pg_temp.espera('D4 as 8 chaves seguem intactas apos ida e volta',
  (SELECT count(*)::text FROM public.global_settings
     WHERE key IN ('api_token','elevenlabs_api_key','zapp_client_secret','whatsapp_bot_token',
                   'user_creation','check_msg_is_group','auto_reopen_hours','group_tickets_enabled')), '8');
\endif

ROLLBACK;

\if :{?sem_conserto}
\echo 'GS-SECRETS VERMELHO: sem a migration, o supervisor le/altera o segredo (o teste ABORTOU acima).'
\else
\echo 'GS-SECRETS OK: supervisor sem acesso nem escrita de chave secreta; admin le/altera;'
\echo '              agente comum e anonimo nao veem nada; nenhuma policy de escrita aceita supervisor;'
\echo '              rollback verbatim restaura o estado anterior e reexpoe o segredo.'
\endif
