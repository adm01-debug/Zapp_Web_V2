-- ============================================================================
-- fix(seguranca): passkey_credentials — o cliente nao insere nem altera coluna
-- que nao seja friendly_name
-- Cartao t_c26fd639 (workersql). Origem: auditoria de paridade V3->V2 do doc 26
-- (hooks raiz S-Z), achados HZ4-06 e HZ5-12.
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) no estado ANTES do conserto (a policy "Users can insert own passkeys" viva
--      e o UPDATE de tabela liberado, como ficou em 20260317222728), o usuario
--      autenticado INSERE uma passkey direto e REESCREVE counter e public_key da
--      propria linha — o defeito descrito no cartao;
--   B) DEPOIS do conserto <ts>_passkey_credentials_hardening:
--        B1 o authenticated NAO insere linha direta (42501, sem policy de INSERT);
--        B2 NAO altera counter / public_key / credential_id (42501, coluna fora do
--           GRANT de coluna) — nem em UPDATE misturado com friendly_name;
--        B3 o dado da linha do dono fica intacto depois das tentativas negadas;
--        B4 a Edge (service_role, BYPASSRLS) continua inserindo e atualizando o
--           counter — o fluxo de registro/login por passkey segue de pe;
--        B5 o dono RENOMEIA (so friendly_name) e APAGA a propria passkey;
--        B6 nao ve nem altera a passkey de OUTRO usuario;
--        B7 o anonimo nao le nem escreve nada;
--        B8 o retrato das policies: sobram SELECT e DELETE do dono; nenhuma de INSERT;
--        C  efeitos colaterais: SELECT/DELETE do dono intactos, o UPDATE de TABELA
--           fora do papel authenticated, nenhuma coluna criada/alterada, anon intocado;
--        E  reaplicar a migration nao muda nada (idempotente);
--        D  o rollback do proprio arquivo roda verbatim e REABRE o defeito
--           (inverso de verdade, nao de fachada).
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superficie minima (roles, schema auth, tabelas e a publicacao) e criada a mao
-- — e ambiente, nao contrato — e a PROTECAO e aplicada VERBATIM dos arquivos de
-- migration do repositorio, via `\i`, na ordem cronologica:
--   20251215025014 -> app_role, user_roles, has_role(), is_admin_or_supervisor()
--   20251231124607 -> tabela passkey_credentials + as 4 policies originais
--   20260317222728 -> reafirma as 4 policies de passkey TO authenticated (estado
--                     vigente no repo, linhas 85-104)
--   <ts>_passkey_credentials_hardening -> a migration sob teste (o conserto)
-- Mesmo padrao de supabase/tests/global_settings_secrets_rls.sql (t_3dd47b33).
--
-- ENFORCEMENT exercido como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated` (e anon / service_role) + JWT sintetico em request.jwt.claims —
-- o caminho do PostgREST, nunca como postgres/superusuario (que ignora RLS e
-- GRANT). Cada operacao confere dentro do helper que current_user e de fato o
-- papel pedido: se o papel nao pegasse, o teste FALHA em vez de dar verde.
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo e montado somente-leitura):
--   docker run --rm -d --name zapp-pk-grants-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-pk-grants-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/passkey_credentials_grants.sql
--   docker rm -f zapp-pk-grants-$$
--
-- VERMELHO (o teste falha quando o conserto nao esta la):
--   `-v sem_conserto=1` — a migration sob teste NAO e aplicada; o BLOCO B cai na
--   primeira assercao (authenticated insere direto). Nada persiste: o arquivo
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
  name text NOT NULL
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assigned_to uuid);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.queues (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid REFERENCES public.contacts(id));
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- Tabelas que a 20260317222728 reafirma policy (so precisam existir; as colunas
-- citadas nas subqueries do USING estao presentes).
CREATE TABLE public.goals_configurations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid);
CREATE TABLE public.ip_whitelist (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.message_reactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.message_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, is_global boolean DEFAULT false);
CREATE TABLE public.mfa_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.queue_goals (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.queue_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.rate_limit_configs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.rate_limit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.scheduled_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid);
CREATE TABLE public.sla_configurations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.user_devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
CREATE TABLE public.user_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ──────────
\echo '── aplicando as migrations REAIS (helpers + passkey_credentials) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20251231124607_b7b9f19a-a6cf-43d2-9ddf-5f87f4a84244.sql
\i :mig_dir/20260317222728_b1aba63c-0318-4b63-913b-67da91c1a290.sql

-- GRANT de tabela do PostgREST: e ele que faz a RLS/ACL de coluna ser a UNICA barreira.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkey_credentials TO authenticated, service_role;
GRANT SELECT ON public.passkey_credentials TO anon;
GRANT SELECT ON public.user_roles TO authenticated, service_role;

-- ── Fixtures (com o gatilho de auth.users desligado) ─────────────────────────
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- DONO (usuario A)
  ('22222222-2222-2222-2222-22222222222b');  -- OUTRO (usuario B)
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'agent'),
  ('22222222-2222-2222-2222-22222222222b', 'agent');

-- Uma passkey de cada usuario (como o service_role da Edge grava). Como postgres,
-- o INSERT ignora RLS de proposito — sao dados de ambiente.
INSERT INTO public.passkey_credentials (user_id, credential_id, public_key, counter, device_type, friendly_name)
VALUES ('11111111-1111-1111-1111-11111111111a', 'cred-A', 'PK-A', 7, 'singleDevice', 'Notebook do A'),
       ('22222222-2222-2222-2222-22222222222b', 'cred-B', 'PK-B', 3, 'singleDevice', 'Celular do B');
SET session_replication_role = origin;

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'PK-GRANTS FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'PK-GRANTS FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
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
    RAISE EXCEPTION 'PK-GRANTS FALHOU: papel real nao aplicado (current_user=%)', current_user;
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
\echo '── T0: a barreira e a RLS + ACL de coluna, nao um TRIGGER ─────────────'
SELECT pg_temp.espera('T0a authenticated TEM SELECT/INSERT/UPDATE/DELETE na tabela (GRANT do PostgREST)',
  has_table_privilege('authenticated', 'public.passkey_credentials', 'SELECT,INSERT,UPDATE,DELETE')::text, 'true');
SELECT pg_temp.espera('T0b anon TEM SELECT (o que barra e a policy, nao o GRANT)',
  has_table_privilege('anon', 'public.passkey_credentials', 'SELECT')::text, 'true');
SELECT pg_temp.espera('T0c RLS ligada em passkey_credentials',
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.passkey_credentials'::regclass), 'true');
SELECT pg_temp.espera('T0d nenhum trigger de usuario na tabela (a trava e RLS/ACL, nao trigger)',
  (SELECT count(*)::text FROM pg_trigger WHERE tgrelid = 'public.passkey_credentials'::regclass AND NOT tgisinternal), '0');
SELECT pg_temp.espera('T0e a fixture tem 2 passkeys (A e B)',
  (SELECT count(*)::text FROM public.passkey_credentials), '2');

-- ── Modo vermelho: sem a migration, o defeito fica de pe ─────────────────────
\if :{?sem_conserto}
  \echo '  [sem_conserto] a migration sob teste NAO sera aplicada (dentro da transacao)'
\else
  \echo '── aplicando a migration SOB TESTE (o conserto) ──'
  \i :mig_dir/20261016005752_passkey_credentials_hardening.sql
\endif

\echo
\echo '── BLOCO A: o cliente planta a propria chave e zera o counter ─────────'
\if :{?sem_conserto}
  SELECT pg_temp.espera('A1 [defeito vivo] authenticated INSERE a propria passkey direto',
    pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
      $sql$INSERT INTO public.passkey_credentials (user_id, credential_id, public_key, counter)
           VALUES ('11111111-1111-1111-1111-11111111111a', 'cred-INVASOR', 'PK-INVASOR', 0)$sql$), 'OK 1');
  SELECT pg_temp.espera('A2 [defeito vivo] authenticated ZERA o counter da propria passkey',
    pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
      $sql$UPDATE public.passkey_credentials SET counter = 0 WHERE credential_id = 'cred-A'$sql$), 'OK 1');
  SELECT pg_temp.espera('A3 [defeito vivo] authenticated TROCA a public_key',
    pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
      $sql$UPDATE public.passkey_credentials SET public_key = 'PK-ROUBADA' WHERE credential_id = 'cred-A'$sql$), 'OK 1');
\else
  SELECT pg_temp.espera('A1 [pos-conserto] authenticated NAO insere a propria passkey direto',
    pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
      $sql$INSERT INTO public.passkey_credentials (user_id, credential_id, public_key, counter)
           VALUES ('11111111-1111-1111-1111-11111111111a', 'cred-INVASOR', 'PK-INVASOR', 0)$sql$), 'ERRO 42501 new row violates row-level security policy for table "passkey_credentials"');
  SELECT pg_temp.espera('A2 [pos-conserto] authenticated NAO zera o counter',
    pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
      $sql$UPDATE public.passkey_credentials SET counter = 0 WHERE credential_id = 'cred-A'$sql$), 'ERRO 42501 permission denied for table passkey_credentials');
  SELECT pg_temp.espera('A3 [pos-conserto] authenticated NAO troca a public_key',
    pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
      $sql$UPDATE public.passkey_credentials SET public_key = 'PK-ROUBADA' WHERE credential_id = 'cred-A'$sql$), 'ERRO 42501 permission denied for table passkey_credentials');
\endif

\echo
\echo '── BLOCO B: contrato do conserto (negacoes, dono, outro, Edge, anon) ──'

-- B2 — credential_id tambem fica fora do alcance do cliente; e UPDATE misturado
--      (friendly_name + counter) cai inteiro, para nao passar metade da mudanca.
SELECT pg_temp.espera('B2a authenticated NAO troca o credential_id',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.passkey_credentials SET credential_id = 'cred-TROCADA' WHERE credential_id = 'cred-A'$sql$), 'ERRO 42501 permission denied for table passkey_credentials');
SELECT pg_temp.espera('B2b UPDATE misturado (friendly_name + counter) e negado inteiro',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.passkey_credentials SET friendly_name = 'Novo nome', counter = 0 WHERE credential_id = 'cred-A'$sql$), 'ERRO 42501 permission denied for table passkey_credentials');

-- B3/B4 — o dado da linha do dono ficou intacto depois das tentativas negadas
SELECT pg_temp.espera('B3a o counter do dono segue 7',
  (SELECT counter::text FROM public.passkey_credentials WHERE credential_id = 'cred-A'), '7');
SELECT pg_temp.espera('B3b a public_key do dono segue PK-A',
  (SELECT public_key FROM public.passkey_credentials WHERE credential_id = 'cred-A'), 'PK-A');
SELECT pg_temp.espera('B3c o friendly_name do dono segue intacto',
  (SELECT friendly_name FROM public.passkey_credentials WHERE credential_id = 'cred-A'), 'Notebook do A');
SELECT pg_temp.espera('B3d nenhuma linha espuria foi criada intentando o INSERT negado',
  (SELECT count(*)::text FROM public.passkey_credentials WHERE credential_id = 'cred-INVASOR'), '0');

-- B4 — a Edge (service_role) continua registrando e atualizando o counter
SELECT pg_temp.espera('B4a service_role (Edge) INSERE nova passkey',
  pg_temp.operacao('service_role', NULL,
    $sql$INSERT INTO public.passkey_credentials (user_id, credential_id, public_key, counter, device_type)
         VALUES ('22222222-2222-2222-2222-22222222222b', 'cred-D', 'PK-D', 0, 'multiDevice')$sql$), 'OK 1');
SELECT pg_temp.espera('B4b service_role (Edge) ATUALIZA o counter do dono',
  pg_temp.operacao('service_role', NULL,
    $sql$UPDATE public.passkey_credentials SET counter = 8, last_used_at = now() WHERE credential_id = 'cred-A'$sql$), 'OK 1');
SELECT pg_temp.espera('B4c o counter atualizado pela Edge pegou',
  (SELECT counter::text FROM public.passkey_credentials WHERE credential_id = 'cred-A'), '8');

-- B5 — o dono RENOMEIA (so friendly_name) e APAGA a propria passkey
SELECT pg_temp.espera('B5a authenticated RENOMEIA a propria passkey (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.passkey_credentials SET friendly_name = 'Notebook novo' WHERE id = (SELECT id FROM public.passkey_credentials WHERE credential_id = 'cred-A')$sql$), 'OK 1');
SELECT pg_temp.espera('B5b o rename pegou',
  (SELECT friendly_name FROM public.passkey_credentials WHERE credential_id = 'cred-A'), 'Notebook novo');

-- B6 — o dono NAO alcanca a passkey de outro usuario
SELECT pg_temp.espera('B6a authenticated nao VE a passkey do outro',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.passkey_credentials WHERE credential_id = 'cred-B'$sql$), '0');
SELECT pg_temp.espera('B6b authenticated nao RENOMEIA a passkey do outro (0 linhas)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.passkey_credentials SET friendly_name = 'Invadida' WHERE credential_id = 'cred-B'$sql$), 'OK 0');
SELECT pg_temp.espera('B6c a passkey do outro segue com o nome original',
  (SELECT friendly_name FROM public.passkey_credentials WHERE credential_id = 'cred-B'), 'Celular do B');
SELECT pg_temp.espera('B6d authenticated nao APAGA a passkey do outro (0 linhas)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$DELETE FROM public.passkey_credentials WHERE credential_id = 'cred-B'$sql$), 'OK 0');
SELECT pg_temp.espera('B6e a passkey do outro continua viva',
  (SELECT count(*)::text FROM public.passkey_credentials WHERE credential_id = 'cred-B'), '1');

-- B7 — o anonimo
SELECT pg_temp.espera('B7a anon nao VE nenhuma passkey',
  pg_temp.valor('anon', NULL, $sql$SELECT count(*)::text FROM public.passkey_credentials$sql$), '0');
SELECT pg_temp.espera('B7b anon nao INSERE (ACL de tabela ja nega)',
  pg_temp.operacao('anon', NULL,
    $sql$INSERT INTO public.passkey_credentials (user_id, credential_id, public_key) VALUES ('11111111-1111-1111-1111-11111111111a', 'cred-anon', 'PK-anon')$sql$), 'ERRO 42501 permission denied for table passkey_credentials');

-- B8 — o dono APAGA a propria passkey (DELETE do dono segue vivo)
SELECT pg_temp.espera('B8a authenticated APAGA a propria passkey (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$DELETE FROM public.passkey_credentials WHERE credential_id = 'cred-A'$sql$), 'OK 1');
SELECT pg_temp.espera('B8b a passkey do dono sumiu',
  (SELECT count(*)::text FROM public.passkey_credentials WHERE credential_id = 'cred-A'), '0');
SELECT pg_temp.espera('B8c o DELETE do dono NAO levou junto a de outro usuario',
  (SELECT count(*)::text FROM public.passkey_credentials WHERE credential_id IN ('cred-B','cred-D')), '2');

-- B9 — retrato das policies: nada de INSERT; SELECT e DELETE do dono vivas
SELECT pg_temp.espera('B9a passkey_credentials tem exatamente 3 policies (era 4: SELECT, UPDATE e DELETE do dono)',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'passkey_credentials'), '3');
SELECT pg_temp.espera('B9b nenhuma policy de INSERT sobrou',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'passkey_credentials' AND cmd = 'INSERT'), '0');
SELECT pg_temp.espera('B9c a policy de SELECT do dono segue TO authenticated',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'passkey_credentials'
     AND cmd = 'SELECT' AND policyname = 'Users can view own passkeys' AND roles = '{authenticated}'::name[]), '1');
SELECT pg_temp.espera('B9d a policy de UPDATE do dono segue TO authenticated (e a ACL de coluna que limita)',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'passkey_credentials'
     AND cmd = 'UPDATE' AND policyname = 'Users can update own passkeys'), '1');
SELECT pg_temp.espera('B9e a policy de DELETE do dono segue TO authenticated',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'passkey_credentials'
     AND cmd = 'DELETE' AND policyname = 'Users can delete own passkeys'), '1');

\echo
\echo '── BLOCO C: efeitos colaterais — nada fora do pedido foi tocado ───────'
SELECT pg_temp.espera('C1 authenticated perdeu o UPDATE de TABELA',
  has_table_privilege('authenticated', 'public.passkey_credentials', 'UPDATE')::text, 'false');
SELECT pg_temp.espera('C2 authenticated NAO perdeu o UPDATE da coluna friendly_name',
  has_column_privilege('authenticated', 'public.passkey_credentials', 'friendly_name', 'UPDATE')::text, 'true');
SELECT pg_temp.espera('C3 authenticated NAO ganhou UPDATE em nenhuma outra coluna',
  (SELECT count(*)::text FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'passkey_credentials'
       AND grantee = 'authenticated' AND privilege_type = 'UPDATE' AND column_name <> 'friendly_name'), '0');
SELECT pg_temp.espera('C4 authenticated segue com SELECT e DELETE de tabela',
  has_table_privilege('authenticated', 'public.passkey_credentials', 'SELECT,DELETE')::text, 'true');
SELECT pg_temp.espera('C5 service_role (a Edge) segue com INSERT/UPDATE de tabela',
  has_table_privilege('service_role', 'public.passkey_credentials', 'INSERT,UPDATE')::text, 'true');
SELECT pg_temp.espera('C6 anon segue sem INSERT/UPDATE/DELETE (nao foi tocado)',
  has_table_privilege('anon', 'public.passkey_credentials', 'INSERT,UPDATE,DELETE')::text, 'false');
SELECT pg_temp.espera('C7 nenhuma coluna foi criada ou removida (seguem as 11 da origem)',
  (SELECT count(*)::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'passkey_credentials'), '11');
SELECT pg_temp.espera('C8 a coluna counter continua BIGINT (nada de tipo trocado)',
  (SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'passkey_credentials' AND column_name = 'counter'), 'bigint');
SELECT pg_temp.espera('C9 o UNIQUE de credential_id segue no lugar',
  (SELECT count(*)::text FROM pg_constraint
     WHERE conrelid = 'public.passkey_credentials'::regclass AND contype = 'u'), '1');
SELECT pg_temp.espera('C10 nenhuma funcao nova foi criada pela migration',
  (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE '%passkey%'), '0');

\echo
\echo '── BLOCO E: reaplicar a migration nao muda o resultado (idempotente) ──'
\if :{?sem_conserto}
  \echo '  [sem_conserto] nada a idempotenciar'
\else
  \i :mig_dir/20261016005752_passkey_credentials_hardening.sql
  SELECT pg_temp.espera('E1 apos reaplicar, seguem 3 policies (SELECT/UPDATE/DELETE)',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'passkey_credentials'), '3');
  SELECT pg_temp.espera('E2 apos reaplicar, o INSERT direto segue negado',
    pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
      $sql$INSERT INTO public.passkey_credentials (user_id, credential_id, public_key)
           VALUES ('22222222-2222-2222-2222-22222222222b', 'cred-E', 'PK-E')$sql$), 'ERRO 42501 new row violates row-level security policy for table "passkey_credentials"');
  SELECT pg_temp.espera('E3 apos reaplicar, o rename do dono segue funcionando',
    pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
      $sql$UPDATE public.passkey_credentials SET friendly_name = 'B renomeada' WHERE credential_id = 'cred-B'$sql$), 'OK 1');
  SELECT pg_temp.espera('E4 apos reaplicar, o UPDATE de tabela continua revogado',
    has_table_privilege('authenticated', 'public.passkey_credentials', 'UPDATE')::text, 'false');
\endif

\echo
\echo '── BLOCO D: o rollback da migration e executavel e e o inverso de verdade ─'
-- Le as linhas "--   <stmt>;" do proprio arquivo da migration (verbatim, sem
-- copia a mao) e executa. Depois prova que o estado ANTERIOR volta: o cliente
-- volta a inserir direto e a zerar o counter — ou seja, o rollback desfaz o
-- conserto de fato.
\if :{?sem_conserto}
  \echo '  [sem_conserto] sem conserto nao ha rollback a provar'
\else
SELECT set_config('pk_grants.repo', :'repo', false);
DO $bloco$
DECLARE
  v_txt  text := pg_read_file(current_setting('pk_grants.repo') || '/supabase/migrations/20261016005752_passkey_credentials_hardening.sql');
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
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'PK-GRANTS FALHOU: rollback do arquivo trouxe % statements (esperava 3)', v_n;
  END IF;
  RAISE NOTICE 'PASS [D1 rollback executado verbatim do arquivo] -> % statements', v_n;
END
$bloco$;
SELECT pg_temp.espera('D2 o rollback restaura as 4 policies (INSERT de volta)',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'passkey_credentials'), '4');
SELECT pg_temp.espera('D3 o rollback REABRE o INSERT direto do cliente — o inverso e real',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.passkey_credentials (user_id, credential_id, public_key, counter)
         VALUES ('22222222-2222-2222-2222-22222222222b', 'cred-ROLLBACK', 'PK-RB', 0)$sql$), 'OK 1');
SELECT pg_temp.espera('D4 o rollback devolve o UPDATE de tabela (zera o counter)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.passkey_credentials SET counter = 0 WHERE credential_id = 'cred-B'$sql$), 'OK 1');
SELECT pg_temp.espera('D5 o counter do outro usuario foi mesmo zerado pelo rollback',
  (SELECT counter::text FROM public.passkey_credentials WHERE credential_id = 'cred-B'), '0');
SELECT pg_temp.espera('D6 a linha do dono (cred-A apagada no B8) nao ressuscitou',
  (SELECT count(*)::text FROM public.passkey_credentials WHERE credential_id = 'cred-A'), '0');
\endif

ROLLBACK;

\if :{?sem_conserto}
\echo 'PK-GRANTS VERMELHO: sem a migration, o cliente insere direto e zera o counter (o teste ABORTOU acima).'
\else
\echo 'PK-GRANTS OK: authenticated nao insere nem altera coluna fora de friendly_name; renomeia e apaga a propria;'
\echo '              nao alcanca a de outro usuario; anonimo nao le nem escreve; a Edge (service_role)'
\echo '              segue registrando e atualizando o counter; rollback verbatim reabre o defeito.'
\endif
