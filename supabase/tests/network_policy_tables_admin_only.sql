-- ============================================================================
-- NET-POLICY-ADMIN-ONLY — escrita em public.ip_whitelist e
-- public.geo_blocking_settings é só de ADMIN (não de supervisor).
--
-- O QUE PROVA (critério de pronto do cartão t_860cdff6):
--   A) um SUPERVISOR NÃO consegue INSERT, UPDATE nem DELETE em nenhuma das duas
--      tabelas — antes, as policies de escrita eram FOR ALL com
--      public.is_admin_or_supervisor(), então o supervisor escrevia;
--   B) um ADMIN consegue as três operações (a correção não fecha a porta de quem
--      deve ter a chave);
--   C) a LEITURA de admin E supervisor continua valendo (as policies de SELECT
--      com is_admin_or_supervisor NÃO foram tocadas);
--   D) `anon` e um agente comum (authenticated sem papel) não escrevem nem leem;
--   E) `service_role` segue com BYPASSRLS (a RLS não barra a máquina);
--   F) a barreira é a RLS, não a ACL: `authenticated` TEM o GRANT de tabela
--      (provado por has_table_privilege) — sem RLS a escrita passaria;
--   G) inventário: não sobra nenhuma policy FOR ALL nas duas tabelas e existem
--      exatamente 3 de escrita (INSERT/UPDATE/DELETE com is_admin) + 1 de leitura.
--
-- COMO A PROTEÇÃO ENTRA NO TESTE (nada de copiar policy para dentro do arquivo):
-- a superfície mínima (roles, schema auth, enum app_role, user_roles, helpers,
-- GRANTs, as duas tabelas) é criada à mão — é ambiente, não contrato. O ESTADO
-- ANTERIOR (as policies FOR ALL com is_admin_or_supervisor) é reconstruído aqui
-- copiando VERBATIM os CM/MESMOS comandos das migrations que o produzem:
--   20260315114854 (ip_whitelist: SELECT) e 20260317222728 (ip_whitelist: FOR ALL)
--   20260317222352 (geo_blocking_settings: FOR ALL) e 20260410103359 (geo: SELECT).
-- A CORREÇÃO sob teste é aplicada VERBATIM do arquivo real via `\i`, quando não
-- há sem_guarda.
--
-- ENFORCEMENT exercido como PAPEL REAL: as asserções rodam com `SET LOCAL ROLE
-- authenticated` + JWT sintético em request.jwt.claims — o caminho do PostgREST,
-- nunca como postgres/superusuário (que ignora RLS e GRANT). O helper confere
-- dentro que `current_user` é de fato o papel pedido.
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-netpol-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-netpol-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/network_policy_tables_admin_only.sql
--   docker rm -f zapp-netpol-$$
--
-- VERMELHO (o teste falha quando a correção não está lá): acrescente `-v sem_guarda=1`.
--   Com sem_guarda a migration de correção NÃO é aplicada e o BLOCO A passa a exigir
--   o DEFEITO (supervisor escreve) — provando que o teste é sensível. Tudo roda numa
--   única transação que termina em ROLLBACK: idempotente, sem efeito colateral.
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
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- ── Helpers de papel (o mesmo contrato das migrations reais) ─────────────────
CREATE TYPE public.app_role AS ENUM ('admin','supervisor','agent');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_roles TO anon, authenticated, service_role;

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::app_role)
$$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

-- ── As duas tabelas do cartão (RLS ligada; a ACL do PostgREST nas mãos delas) ─
CREATE TABLE public.ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  description text NOT NULL,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.geo_blocking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'disabled',
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.geo_blocking_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_whitelist, public.geo_blocking_settings
  TO anon, authenticated, service_role;

-- ── ESTADO ANTERIOR (defeito), copiado verbatim das migrations que o definem ─
-- ip_whitelist — SELECT (20260315114854) + FOR ALL de escrita (20260317222728)
CREATE POLICY "Admins can view IP whitelist" ON public.ip_whitelist
  FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
-- geo_blocking_settings — SELECT (20260410103359) + FOR ALL de escrita (20260317222352)
CREATE POLICY "Geo blocking visible to admins only" ON public.geo_blocking_settings
  FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can manage geo settings" ON public.geo_blocking_settings
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- ── Fixtures (auth.users primeiro; gatilhos de auth em replica) ──────────────
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),  -- ADMIN
  ('22222222-2222-2222-2222-22222222222b'),  -- AGENTE
  ('44444444-4444-4444-4444-44444444444d');  -- SUPERVISOR
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('22222222-2222-2222-2222-22222222222b', 'agent'),
  ('44444444-4444-4444-4444-44444444444d', 'supervisor');
INSERT INTO public.ip_whitelist (ip_address, description, added_by) VALUES
  ('10.0.0.1', 'seed ip_whitelist', '11111111-1111-1111-1111-11111111111a');
INSERT INTO public.geo_blocking_settings (mode, updated_by) VALUES
  ('disabled', '11111111-1111-1111-1111-11111111111a');
SET session_replication_role = origin;

-- ── A CORREÇÃO, verbatim do arquivo real (pulada no modo vermelho) ───────────
\if :{?sem_guarda}
  \echo '  [sem_guarda] a migration de correcao NAO foi aplicada (estado anterior preservado)'
\else
  \echo '── aplicando a migration REAL da correcao ──'
  \i :mig_dir/20261013035213_network_policy_tables_admin_only.sql
\endif

-- ── Helpers do próprio teste ────────────────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'NET-POLICY FALHOU [%]: esperado %, obtido %', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

CREATE FUNCTION pg_temp.espera_erro(p_label text, p_atual text, p_sqlstate text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS NULL OR p_atual NOT LIKE 'ERRO ' || p_sqlstate || ' %' THEN
    RAISE EXCEPTION 'NET-POLICY FALHOU [%]: esperava erro SQLSTATE %, veio: %', p_label, p_sqlstate, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- Roda p_sql sob o PAPEL REAL (SET LOCAL ROLE) com o JWT do usuário p_uid.
-- Devolve 'OK <linhas>' ou 'ERRO <sqlstate> <mensagem>'.
CREATE FUNCTION pg_temp.operacao(p_papel text, p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $h$
DECLARE v_ret text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  IF current_user <> p_papel THEN
    RAISE EXCEPTION 'NET-POLICY FALHOU: papel real nao aplicado (current_user=%)', current_user;
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

-- ── T0: a barreira é a RLS, não a ACL ───────────────────────────────────────
SELECT pg_temp.espera('T0 authenticated TEM INSERT/UPDATE/DELETE/SELECT nas tabelas (GRANT do PostgREST)',
  has_table_privilege('authenticated', 'public.ip_whitelist', 'INSERT,UPDATE,DELETE,SELECT')::text
  || '/' || has_table_privilege('authenticated', 'public.geo_blocking_settings', 'INSERT,UPDATE,DELETE,SELECT')::text,
  'true/true');
SELECT pg_temp.espera('T0b RLS ligada nas duas tabelas',
  (SELECT (relrowsecurity)::text || '/' ||
          (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.geo_blocking_settings'::regclass)
     FROM pg_class WHERE oid = 'public.ip_whitelist'::regclass),
  'true/true');

\if :{?sem_guarda}
\echo
\echo '── BLOCO A (MODO VERMELHO): sem a correcao o SUPERVISOR escreve ────────────'
SELECT pg_temp.espera('A1 (DEFEITO) supervisor INSERE em ip_whitelist',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$INSERT INTO public.ip_whitelist (ip_address, description, added_by)
         VALUES ('10.9.9.9', 'supervisor nao pode', '44444444-4444-4444-4444-44444444444d')$sql$),
  'OK 1');
SELECT pg_temp.espera('A2 (DEFEITO) supervisor ALTERA ip_whitelist',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$UPDATE public.ip_whitelist SET description = 'invadido' WHERE ip_address = '10.0.0.1'$sql$),
  'OK 1');
SELECT pg_temp.espera('A3 (DEFEITO) supervisor APAGA ip_whitelist',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$DELETE FROM public.ip_whitelist WHERE ip_address = '10.0.0.1'$sql$),
  'OK 1');
SELECT pg_temp.espera('A4 (DEFEITO) supervisor ALTERA geo_blocking_settings',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$UPDATE public.geo_blocking_settings SET mode = 'enabled'$sql$),
  'OK 1');
\else
\echo
\echo '── BLOCO B: com a correcao o SUPERVISOR nao escreve nas duas tabelas ──────'
-- ip_whitelist
SELECT pg_temp.espera_erro('B1 supervisor NAO INSERT em ip_whitelist (RLS)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$INSERT INTO public.ip_whitelist (ip_address, description, added_by)
         VALUES ('10.9.9.9', 'supervisor nao pode', '44444444-4444-4444-4444-44444444444d')$sql$),
  '42501');
SELECT pg_temp.espera('B2 o INSERT recusado nao criou linha',
  (SELECT count(*)::text FROM public.ip_whitelist WHERE ip_address = '10.9.9.9'), '0');
SELECT pg_temp.espera('B3 supervisor NAO ALTERA ip_whitelist (0 linhas)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$UPDATE public.ip_whitelist SET description = 'invadido' WHERE ip_address = '10.0.0.1'$sql$),
  'OK 0');
SELECT pg_temp.espera('B3b a descricao continua intacta',
  (SELECT description FROM public.ip_whitelist WHERE ip_address = '10.0.0.1'), 'seed ip_whitelist');
SELECT pg_temp.espera('B4 supervisor NAO APAGA ip_whitelist (0 linhas)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$DELETE FROM public.ip_whitelist WHERE ip_address = '10.0.0.1'$sql$),
  'OK 0');
SELECT pg_temp.espera('B4b a linha continua existindo',
  (SELECT count(*)::text FROM public.ip_whitelist WHERE ip_address = '10.0.0.1'), '1');
-- geo_blocking_settings
SELECT pg_temp.espera_erro('B5 supervisor NAO INSERT em geo_blocking_settings (RLS)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$INSERT INTO public.geo_blocking_settings (mode, updated_by)
         VALUES ('enabled', '44444444-4444-4444-4444-44444444444d')$sql$),
  '42501');
SELECT pg_temp.espera('B6 supervisor NAO ALTERA geo_blocking_settings (0 linhas)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$UPDATE public.geo_blocking_settings SET mode = 'enabled'$sql$),
  'OK 0');
SELECT pg_temp.espera('B6b o modo continua disabled',
  (SELECT mode FROM public.geo_blocking_settings LIMIT 1), 'disabled');
SELECT pg_temp.espera('B7 supervisor NAO APAGA geo_blocking_settings (0 linhas)',
  pg_temp.operacao('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$DELETE FROM public.geo_blocking_settings$sql$),
  'OK 0');

\echo
\echo '── BLOCO C: o ADMIN segue com a chave (insert/update/delete) ──────────────'
SELECT pg_temp.espera('C1 admin INSERT ip_whitelist (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.ip_whitelist (ip_address, description, added_by)
         VALUES ('10.9.9.9', 'admin pode', '11111111-1111-1111-1111-11111111111a')$sql$),
  'OK 1');
SELECT pg_temp.espera('C2 admin UPDATE ip_whitelist (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.ip_whitelist SET description = 'ok' WHERE ip_address = '10.9.9.9'$sql$),
  'OK 1');
SELECT pg_temp.espera('C3 admin DELETE ip_whitelist (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$DELETE FROM public.ip_whitelist WHERE ip_address = '10.9.9.9'$sql$),
  'OK 1');
SELECT pg_temp.espera('C4 admin INSERT geo_blocking_settings (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$INSERT INTO public.geo_blocking_settings (mode, updated_by)
         VALUES ('enabled', '00000000-0000-0000-0000-0000000000c4')$sql$),
  'OK 1');
SELECT pg_temp.espera('C5 admin UPDATE geo_blocking_settings (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$UPDATE public.geo_blocking_settings SET mode = 'disabled' WHERE updated_by = '00000000-0000-0000-0000-0000000000c4'$sql$),
  'OK 1');
SELECT pg_temp.espera('C6 admin DELETE geo_blocking_settings (1 linha)',
  pg_temp.operacao('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$DELETE FROM public.geo_blocking_settings WHERE updated_by = '00000000-0000-0000-0000-0000000000c4'$sql$),
  'OK 1');

\echo
\echo '── BLOCO D: a LEITURA de admin E supervisor continua valendo ──────────────'
SELECT pg_temp.espera('D1 supervisor LE ip_whitelist (1 linha)',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.ip_whitelist$sql$), '1');
SELECT pg_temp.espera('D2 supervisor LE geo_blocking_settings (1 linha)',
  pg_temp.valor('authenticated', '44444444-4444-4444-4444-44444444444d',
    $sql$SELECT count(*)::text FROM public.geo_blocking_settings$sql$), '1');
SELECT pg_temp.espera('D3 admin LE ip_whitelist (1 linha)',
  pg_temp.valor('authenticated', '11111111-1111-1111-1111-11111111111a',
    $sql$SELECT count(*)::text FROM public.ip_whitelist$sql$), '1');

\echo
\echo '── BLOCO E: anon, agente comum e service_role ─────────────────────────────'
SELECT pg_temp.espera('E1 agente comum NAO le ip_whitelist (RLS filtra)',
  pg_temp.valor('authenticated', '22222222-2222-2222-2222-22222222222b',
    $sql$SELECT count(*)::text FROM public.ip_whitelist$sql$), '0');
SELECT pg_temp.espera('E2 anon NAO le ip_whitelist (RLS filtra)',
  pg_temp.valor('anon', '00000000-0000-0000-0000-000000000000',
    $sql$SELECT count(*)::text FROM public.ip_whitelist$sql$), '0');
SELECT pg_temp.espera_erro('E3 anon NAO INSERT ip_whitelist (RLS)',
  pg_temp.operacao('anon', '00000000-0000-0000-0000-000000000000',
    $sql$INSERT INTO public.ip_whitelist (ip_address, description, added_by)
         VALUES ('8.8.8.8', 'anon nao pode', gen_random_uuid())$sql$), '42501');
SELECT pg_temp.espera('E4 service_role INSERE em ip_whitelist (BYPASSRLS intacto)',
  pg_temp.operacao('service_role', '00000000-0000-0000-0000-000000000000',
    $sql$INSERT INTO public.ip_whitelist (ip_address, description, added_by)
         VALUES ('8.8.8.8', 'maquina pode', gen_random_uuid())$sql$), 'OK 1');
SELECT pg_temp.espera('E5 service_role INSERE em geo_blocking_settings (BYPASSRLS intacto)',
  pg_temp.operacao('service_role', '00000000-0000-0000-0000-000000000000',
    $sql$INSERT INTO public.geo_blocking_settings (mode, updated_by)
         VALUES ('enabled', gen_random_uuid())$sql$), 'OK 1');

\echo
\echo '── BLOCO F: inventario de policies (sem deparse; nome+cmd+roles) ──────────'
SELECT pg_temp.espera('F1 nenhuma policy FOR ALL restou',
  (SELECT count(*)::text FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('ip_whitelist','geo_blocking_settings') AND cmd='ALL'), '0');
SELECT pg_temp.espera('F2 ip_whitelist = 3 escrita + 1 leitura',
  (SELECT string_agg(policyname || '=' || cmd || '=' || array_to_string(roles,','), '; ' ORDER BY policyname)
     FROM pg_policies WHERE schemaname='public' AND tablename='ip_whitelist'),
  'Admins can delete IP whitelist=DELETE=authenticated; Admins can insert IP whitelist=INSERT=authenticated; Admins can update IP whitelist=UPDATE=authenticated; Admins can view IP whitelist=SELECT=authenticated');
SELECT pg_temp.espera('F3 geo_blocking_settings = 3 escrita + 1 leitura',
  (SELECT string_agg(policyname || '=' || cmd || '=' || array_to_string(roles,','), '; ' ORDER BY policyname)
     FROM pg_policies WHERE schemaname='public' AND tablename='geo_blocking_settings'),
  'Admins can delete geo settings=DELETE=authenticated; Admins can insert geo settings=INSERT=authenticated; Admins can update geo settings=UPDATE=authenticated; Geo blocking visible to admins only=SELECT=authenticated');
\endif

\echo
\echo 'NET-POLICY-ADMIN-ONLY ip_whitelist/geo_blocking_settings: OK'

ROLLBACK;
