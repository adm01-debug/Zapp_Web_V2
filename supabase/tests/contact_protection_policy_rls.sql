-- ============================================================================
-- feat(db): politica de protecao de contatos vinda do servidor
-- Cartao CT-091 (workersql). Plano docs/plans/PLANO_CONTATOS_POR_JORNADA_2026-10-08.md,
-- bloco "Protecao dos dados (transversal)". Depende do item 085.
--
-- O QUE PROVA (criterio de pronto do cartao):
--   A) no estado ANTES da migration nao existe regra nenhuma de protecao no banco:
--      nao ha tabela nem RPC — o bloqueio de copiar/imprimir so poderia depender do
--      navegador. No modo `-v sem_conserto=1` o BLOCO B cai na primeira assercao.
--   B) DEPOIS da migration <ts>_ct091_contact_protection_policy:
--        B0 bem-vindo ao defeito vivo: a RPC nao existe;
--        B1 o PADRAO e tudo ligado (bloquear_copia/impressao=true, marca_dagua=true,
--           mascarar_contato=true, limite_fichas_hora=100) para admin, agente e
--           supervisor SEM nenhuma linha de override;
--        B2 so o ADMINISTRADOR altera: agente/supervisor recebem 42501 no INSERT,
--           UPDATE e DELETE nao afetam nenhuma linha;
--        B3 o admin cria a linha do papel 'agent' (bloquear_copia=false, marca_dagua=false,
--           limite=10) e o agente passa a receber essa politica — a linha do papel
--           sobrepoe a global;
--        B4 o admin altera a linha global (limite=50) e os demais papeis veem o novo valor;
--        B5 mais de um papel: quem e admin+agent NAO herda o override de 'agent'
--           (vale o papel de maior privilegio — ordem do enum);
--        B6 o anonimo nao le a tabela e nao chama a RPC (a migration revoga o que o
--           privilegio padrao do Supabase dava);
--        B7 entrada invalida barra: limite negativo (23514) e segunda linha do mesmo
--           escopo (23505);
--        E  reaplicar a migration nao muda nada (idempotente);
--        D  o rollback do proprio arquivo roda verbatim, na ordem inversa, e a RPC e a
--           tabela somem — inverso de verdade, nao de fachada.
--
-- COMO A PROTECAO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superficie minima (roles, schema auth, tabelas de apoio) e criada a mao — e
-- ambiente, nao contrato — e a PROTECAO e aplicada VERBATIM das migrations do
-- repositorio, via `\i`, em ordem cronologica:
--   20251215025014 -> app_role, user_roles, has_role(), is_admin_or_supervisor()
--   20260830080000 -> is_admin()
--   <ts>_ct091_contact_protection_policy -> a migration sob teste
-- Mesmo padrao de supabase/tests/global_settings_secrets_rls.sql e
-- scripts/db-audit/dashboard-rls-authorization.test.sh.
--
-- ENFORCEMENT exercido como PAPEL REAL: as assercoes rodam com `SET LOCAL ROLE
-- authenticated` (e anon) + JWT sintetico em request.jwt.claims — o caminho do
-- PostgREST, nunca como postgres/superusuario (que ignora RLS e GRANT).
--
-- COMO RODA (PostgreSQL 17 descartavel; o repo entra montado somente-leitura em /repo):
--   sobe um container efemero da imagem oficial do PostgreSQL 17 com o repo montado em
--   /repo e a porta publicada so em 127.0.0.1, e roda este arquivo com o psql do host
--   passando `-v repo=/repo -v mig_dir="$PWD/supabase/migrations"`. O DSN local efemero e
--   a senha do container NAO entram no arquivo — nada de segredo aqui: o JWT do teste e
--   sintetico (request.jwt.claims). O bloco D le a migration por /repo, por isso o
--   mapeamento e obrigatorio. Ao fim, o container descartavel e derrubado.
--
-- Tudo roda numa unica transacao que termina em ROLLBACK: idempotente, sem efeito
-- colateral e reaplicavel.
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

-- O default privilege do Supabase no schema public: e ele que deixa o anon fazer
-- tudo em tabela/funcao nova. A migration precisa cortar isso (T0b/B6).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ── Fixtures entram sem disparar o gatilho de auth.users ────────────────────
SET session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b'),  -- AGENTE
  ('44444444-4444-4444-4444-44444444444d'),  -- SUPERVISOR
  ('55555555-5555-5555-5555-55555555555e');  -- ADMIN + AGENT (dois papeis)

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN CP'),
  ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-22222222222b', 'AGENTE CP'),
  ('d0000000-0000-0000-0000-00000000000d', '44444444-4444-4444-4444-44444444444d', 'SUPERVISOR CP'),
  ('e0000000-0000-0000-0000-00000000000e', '55555555-5555-5555-5555-55555555555e', 'MULTI CP');

SET session_replication_role = origin;

-- ── A PROTECAO, verbatim das migrations reais, em ordem cronologica ─────────
\echo '── aplicando as migrations REAIS (helpers de papel) ──'
\i :mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql
\i :mig_dir/20260830080000_fn_is_admin_and_fix_permissions_rls.sql

-- Fixtures de papel (depois das policies, com o gatilho de auth.users desligado).
SET session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent'),
  ('44444444-4444-4444-4444-44444444444d', 'supervisor'),
  ('55555555-5555-5555-5555-55555555555e', 'admin'),
  ('55555555-5555-5555-5555-55555555555e', 'agent');
SET session_replication_role = origin;

-- ── Helpers do proprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'CT-091 FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'CT-091 FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
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
    RAISE EXCEPTION 'CT-091 FALHOU: papel real nao aplicado (current_user=%)', current_user;
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

-- Um unico valor, lido sob o PAPEL REAL.
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

-- Campo da politica efetiva, lido sob o papel real (nunca pela tabela crua).
CREATE FUNCTION pg_temp.pol(p_papel text, p_uid uuid, p_campo text) RETURNS text
LANGUAGE sql AS $h$
  SELECT pg_temp.valor(p_papel, p_uid,
    format('SELECT (public.get_my_protection_policy()).%I::text', p_campo))
$h$;

-- ── Modo vermelho: sem a migration, o defeito fica de pe ─────────────────────
\if :{?sem_conserto}
  \echo '  [sem_conserto] a migration sob teste NAO sera aplicada (dentro da transacao)'
\else
  \echo '── aplicando a migration SOB TESTE (o conserto) ──'
  \i :mig_dir/20261015225226_ct091_contact_protection_policy.sql
\endif

\if :{?sem_conserto}
  \echo
  \echo '  [sem_conserto] a tabela/RPC do conserto nao existem aqui; a T0 e pulada e o BLOCO B abaixo falha de proposito.'
\else
  \echo
  \echo '── T0: a barreira e a RLS, nao a ACL ───────────────────────────────────'
  SELECT pg_temp.espera('T0 RLS ligada em contact_protection_policy',
    (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.contact_protection_policy'::regclass), 'true');
  SELECT pg_temp.espera('T0a authenticated TEM DML (GRANT do PostgREST) — a RLS e a barreira',
    has_table_privilege('authenticated', 'public.contact_protection_policy', 'SELECT,INSERT,UPDATE,DELETE')::text, 'true');
  SELECT pg_temp.espera('T0b anon PERDEU o privilegio padrao do Supabase (a migration revogou)',
    coalesce(has_table_privilege('anon', 'public.contact_protection_policy', 'SELECT')::text,'NULL'), 'false');
  SELECT pg_temp.espera('T0c a migration semeou 1 linha global com o padrao',
    (SELECT count(*)::text FROM public.contact_protection_policy WHERE scope_role IS NULL), '1');
  SELECT pg_temp.espera('T0d a linha global nasceu com tudo ligado e limite 100',
    (SELECT (bloquear_copia::text||'/'||bloquear_impressao::text||'/'||marca_dagua::text||'/'||mascarar_contato::text||'/'||limite_fichas_hora::text)
       FROM public.contact_protection_policy WHERE scope_role IS NULL), 'true/true/true/true/100');
\endif

\echo
\echo '── BLOCO B: politica efetiva do usuario (o contrato do cartao) ────────'

-- B0 — com o conserto a RPC existe; sem ele, esta assercao ABORTA o teste (vermelho).
SELECT pg_temp.espera('B0 a RPC get_my_protection_policy() existe e devolve o padrao do admin',
  pg_temp.pol('authenticated', '11111111-1111-1111-1111-11111111111a', 'bloquear_copia'), 'true');

-- B1 — PADRAO = tudo ligado, sem nenhuma linha de override
SELECT pg_temp.espera('B1a agente sem override: bloquear_copia=true',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'bloquear_copia'), 'true');
SELECT pg_temp.espera('B1b agente sem override: bloquear_impressao=true',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'bloquear_impressao'), 'true');
SELECT pg_temp.espera('B1c agente sem override: marca_dagua=true',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'marca_dagua'), 'true');
SELECT pg_temp.espera('B1d agente sem override: mascarar_contato=true',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'mascarar_contato'), 'true');
SELECT pg_temp.espera('B1e agente sem override: limite_fichas_hora=100',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'limite_fichas_hora'), '100');
SELECT pg_temp.espera('B1f a origem da politica do agente e a global',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'origem'), 'global');
SELECT pg_temp.espera('B1g o supervisor tambem recebe tudo ligado (100)',
  pg_temp.pol('authenticated', '44444444-4444-4444-4444-44444444444d', 'limite_fichas_hora'), '100');

-- B2 — SO ADMINISTRADOR ALTERA
SELECT pg_temp.espera_erro('B2a agente NAO insere politica (42501)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$INSERT INTO public.contact_protection_policy (scope_role, limite_fichas_hora) VALUES ('agent', 5)$sql$), '42501');
SELECT pg_temp.espera_erro('B2b supervisor NAO insere politica (42501)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$INSERT INTO public.contact_protection_policy (scope_role, limite_fichas_hora) VALUES ('supervisor', 5)$sql$), '42501');
SELECT pg_temp.espera('B2c agente NAO atualiza a linha global (0 linhas)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$UPDATE public.contact_protection_policy SET limite_fichas_hora = 999 WHERE scope_role IS NULL$sql$), 'OK 0');
SELECT pg_temp.espera('B2d agente NAO apaga politica (0 linhas)',
  pg_temp.operacao('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$DELETE FROM public.contact_protection_policy$sql$), 'OK 0');
SELECT pg_temp.espera('B2e nada das tentativas negadas entrou (segue so a linha global)',
  (SELECT count(*)::text FROM public.contact_protection_policy), '1');
SELECT pg_temp.espera('B2f supervisor tambem NAO ve a tabela crua (0 linhas)',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.contact_protection_policy$sql$), '0');

-- B3 — o admin cria a linha do papel 'agent' e o agente passa a receber esse override
SELECT pg_temp.espera('B3a admin insere a politica do papel agent (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.contact_protection_policy (scope_role, bloquear_copia, marca_dagua, limite_fichas_hora)
        VALUES ('agent', false, false, 10)$sql$), 'OK 1');
SELECT pg_temp.espera('B3b o agente agora tem bloquear_copia=false (override do papel)',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'bloquear_copia'), 'false');
SELECT pg_temp.espera('B3c o agente agora tem marca_dagua=false',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'marca_dagua'), 'false');
SELECT pg_temp.espera('B3d o agente agora tem limite=10',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'limite_fichas_hora'), '10');
SELECT pg_temp.espera('B3e o campo nao mexido do override segue ligado (bloquear_impressao=true)',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'bloquear_impressao'), 'true');
SELECT pg_temp.espera('B3f a origem da politica do agente agora e o papel',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'origem'), 'papel');
SELECT pg_temp.espera('B3g o override de agent NAO vaza para o admin (segue true/100)',
  pg_temp.pol('authenticated', '11111111-1111-1111-1111-11111111111a', 'bloquear_copia') || '/' ||
  pg_temp.pol('authenticated', '11111111-1111-1111-1111-11111111111a', 'limite_fichas_hora'), 'true/100');

-- B4 — o admin altera a linha global; os papeis sem override veem o novo valor
SELECT pg_temp.espera('B4a admin atualiza a linha global (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.contact_protection_policy SET limite_fichas_hora = 50 WHERE scope_role IS NULL$sql$), 'OK 1');
SELECT pg_temp.espera('B4b o supervisor ve o novo limite global (50)',
  pg_temp.pol('authenticated', '44444444-4444-4444-4444-44444444444d', 'limite_fichas_hora'), '50');
SELECT pg_temp.espera('B4c o agente mantem o override (10), nao o global',
  pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'limite_fichas_hora'), '10');

-- B5 — mais de um papel: vale o de maior privilegio (admin), nao o override de agent
SELECT pg_temp.espera('B5a admin+agent NAO herda o override de agent (limite=50, origem=global)',
  pg_temp.pol('authenticated', '55555555-5555-5555-5555-55555555555e', 'limite_fichas_hora') || '/' ||
  pg_temp.pol('authenticated', '55555555-5555-5555-5555-55555555555e', 'origem'), '50/global');

-- B6 — anonimo: nem le a tabela, nem chama a RPC
SELECT pg_temp.espera_erro('B6a anon NAO le a tabela crua (42501)',
  pg_temp.operacao('anon', NULL, $sql$SELECT count(*) FROM public.contact_protection_policy$sql$), '42501');
SELECT pg_temp.espera_erro('B6b anon NAO executa a RPC (42501)',
  pg_temp.operacao('anon', NULL, $sql$SELECT public.get_my_protection_policy()$sql$), '42501');
SELECT pg_temp.espera_erro('B6c papel authenticated sem JWT (uid nulo) e recusado pela RPC (42501)',
  pg_temp.operacao('authenticated', NULL, $sql$SELECT public.get_my_protection_policy()$sql$), '42501');

-- B7 — entrada invalida e unicidade do escopo
SELECT pg_temp.espera_erro('B7a limite negativo e barrado pelo CHECK (23514)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.contact_protection_policy (scope_role, limite_fichas_hora) VALUES ('supervisor', -1)$sql$), '23514');
SELECT pg_temp.espera_erro('B7b segunda linha para o MESMO escopo e barrada (23505)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.contact_protection_policy (scope_role, limite_fichas_hora) VALUES ('agent', 7)$sql$), '23505');
SELECT pg_temp.espera_erro('B7c segunda linha GLOBAL (scope_role NULL) tambem e barrada (23505)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.contact_protection_policy (scope_role, limite_fichas_hora) VALUES (NULL, 7)$sql$), '23505');

\echo
\echo '── BLOCO C: efeito colateral — a migration nao afrouxou nada ───────────'
SELECT pg_temp.espera('C1 ha exatamente 4 policies, uma por comando (sem FOR ALL)',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='contact_protection_policy'), '4');
SELECT pg_temp.espera('C2 nenhuma policy usa FOR ALL',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='contact_protection_policy' AND cmd='ALL'), '0');
SELECT pg_temp.espera('C3 toda policy de escrita exige has_role(admin)',
  (SELECT count(*)::text FROM pg_policies
    WHERE schemaname='public' AND tablename='contact_protection_policy' AND cmd <> 'SELECT'
      AND coalesce(with_check, qual) LIKE '%has_role(%'), '3');
SELECT pg_temp.espera('C4 nenhuma policy de escrita aceita is_admin_or_supervisor',
  (SELECT count(*)::text FROM pg_policies
    WHERE schemaname='public' AND tablename='contact_protection_policy' AND cmd <> 'SELECT'
      AND coalesce(with_check, qual) LIKE '%is_admin_or_supervisor%'), '0');
SELECT pg_temp.espera('C5 a RPC tem search_path fixo',
  (SELECT count(*)::text FROM pg_proc
    WHERE oid='public.get_my_protection_policy()'::regprocedure
      AND proconfig::text LIKE '%search_path=public%'), '1');
SELECT pg_temp.espera('C6 as outras tabelas nao foram tocadas (user_roles com 5 papeis)',
  (SELECT count(*)::text FROM public.user_roles), '5');

\echo
\echo '── BLOCO E: reaplicar a migration nao muda o resultado (idempotente) ────'
\if :{?sem_conserto}
  \echo '  [sem_conserto] nada a idempotenciar'
\else
  \i :mig_dir/20261015225226_ct091_contact_protection_policy.sql
  SELECT pg_temp.espera('E1 apos reaplicar, seguem 4 policies',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='contact_protection_policy'), '4');
  SELECT pg_temp.espera('E2 apos reaplicar, a linha global nao duplicou (2 linhas: global + agent)',
    (SELECT count(*)::text FROM public.contact_protection_policy), '2');
  SELECT pg_temp.espera('E3 apos reaplicar, o override do agente segue valendo (10)',
    pg_temp.pol('authenticated', '22222222-2222-2222-2222-22222222222b', 'limite_fichas_hora'), '10');
\endif

\echo
\echo '── BLOCO D: o rollback da migration e executavel e e o inverso de verdade ─'
-- Le as linhas "--   <stmt>;" do proprio arquivo da migration (verbatim, sem copia
-- a mao) e executa na ordem. Depois prova que o estado ANTERIOR volta: a tabela e a
-- RPC somem — ou seja, o rollback desfaz o conserto de fato.
\if :{?sem_conserto}
  \echo '  [sem_conserto] sem conserto nao ha rollback a provar'
\else
DO $bloco$
DECLARE
  -- caminho dentro do container descartavel (o repo entra montado em /repo:ro)
  v_txt  text := pg_read_file('/repo/supabase/migrations/20261015225226_ct091_contact_protection_policy.sql');
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
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CT-091 FALHOU: rollback do arquivo trouxe % statements (esperava 2)', v_n;
  END IF;
  RAISE NOTICE 'PASS [D1 rollback executado verbatim do arquivo] -> % statements', v_n;
END
$bloco$;
SELECT pg_temp.espera('D2 apos o rollback a tabela sumiu (inverso real)',
  coalesce(to_regclass('public.contact_protection_policy')::text,'AUSENTE'), 'AUSENTE');
SELECT pg_temp.espera('D3 apos o rollback a RPC sumiu (inverso real)',
  coalesce(to_regprocedure('public.get_my_protection_policy()')::text,'AUSENTE'), 'AUSENTE');
SELECT pg_temp.espera('D4 o rollback nao tocou o enum app_role nem user_roles',
  (SELECT count(*)::text FROM public.user_roles), '5');
\endif

ROLLBACK;

\if :{?sem_conserto}
\echo 'CT-091 VERMELHO: sem a migration nao ha tabela nem RPC de protecao — o BLOCO B aborta acima.'
\else
\echo 'CT-091 OK: padrao tudo ligado (limite 100); so o admin altera; a linha do papel'
\echo '           sobrepoe a global; multi-papel usa o mais privilegiado; anon sem acesso;'
\echo '           entrada invalida barrada; idempotente; rollback verbatim desfaz.'
\endif
