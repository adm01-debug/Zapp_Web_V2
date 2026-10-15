-- ============================================================================
-- NET-POLICY-CIDR/IPV6 — resolve_network_policy entende faixa CIDR e IPv6 nas
-- listas de IP, e as duas tabelas recusam IP/CIDR inválido na gravação.
--
-- O QUE PROVA (critério de pronto do cartão t_5f5b2ce6):
--   A) uma entrada 'a.b.c.d/nn' em public.blocked_ips passa a BLOQUEAR o IP que
--      está dentro da faixa (antes só casava texto exato — o cartão PD-09);
--   B) uma faixa em public.ip_whitelist passa a ISENTAR o bloqueio por IP do IP
--      que está dentro dela;
--   C) IP exato (comportamento anterior) continua funcionando nas duas listas;
--   D) faixa IPv6 (::/nn) funciona tanto para bloquear quanto para isentar;
--   E) famílias diferentes (IPv4 x IPv6) NUNCA se contêm;
--   F) gravação inválida em ip_whitelist/blocked_ips é recusada (SQLSTATE 23514)
--      e gravação válida passa;
--   J) o ADMIN do painel (authenticated + RLS de is_admin, com as policies de
--      escrita do PD-09) grava CIDR válido (INSERT e UPDATE passam — sem o
--      42501 da recusa) e o inválido leva 23514 (não 42501); o SUPERVISOR
--      continua negado pela RLS;
--   G) NADA é apagado: linha legada inválida continua na tabela (constraint NOT
--      VALID), a contagem não muda e a RPC não explode ao varrer a linha legada;
--   H) o saneamento só tira espaços de IP válido e não colide com a UNIQUE;
--   I) NÃO afrouxei ACL: a RPC e o helper ip_entry_matches seguem só para
--      service_role; anon e authenticated levam 42501 na RPC; anon leva 42501
--      no validador; authenticated EXECUTA o validador (GRANT da correção —
--      sem ele o admin do painel levaria 42501 na CHECK).
--
-- COMO A PROTEÇÃO ENTRA NO TESTE: a superfície mínima (roles, schema auth, as
-- tabelas reais) é criada à mão — é ambiente, não contrato. As colunas das
-- tabelas são copiadas VERBATIM das migrations que as criam (20251231115910,
-- 20251231130733, 20251231131019). O CONTRATO sob teste é aplicado VERBATIM dos
-- arquivos reais via meta-comando de inclusao: a RPC anterior (20261004182245) sempre, a correção
-- (20261014120000_network_policy_cidr.sql) quando não há sem_guarda, e as
-- policies de escrita do PD-09 (20261013035213) sempre — estado do pai, não a
-- correção. As policies de escrita de blocked_ips (admin-only, VERBATIM da
-- gate16 20260830150000) e os papéis (auth.uid, user_roles, is_admin) são
-- ambiente: reproduzem o caminho do painel (authenticated + JWT).
--
-- ENFORCEMENT exercido como PAPEL REAL: as chamadas rodam com `SET LOCAL ROLE
-- service_role` (o caminho das Edge Functions) — nunca como postgres, que
-- ignora GRANT e RLS. O helper confere dentro que `current_user` é o papel pedido.
--
-- COMO RODA (PostgreSQL 17 descartável; o repo é montado somente-leitura):
--   docker run --rm -d --name zapp-netcidr-$$ -e POSTGRES_PASSWORD=test_only \
--     -v "$PWD:/repo:ro" postgres:17-alpine
--   docker exec -i zapp-netcidr-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v repo=/repo -v mig_dir=/repo/supabase/migrations \
--     < supabase/tests/network_policy_cidr_ipv6.sql
--   docker rm -f zapp-netcidr-$$
--
-- VERMELHO (o teste falha quando a correção não está lá): acrescente `-v sem_guarda=1`.
--   Com sem_guarda a correção NÃO é aplicada: o BLOCO R passa a exigir o DEFEITO
--   (a faixa não bloqueia; a gravação inválida é aceita). Tudo roda numa única
--   transação que termina em ROLLBACK: idempotente, sem efeito colateral.
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
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
-- auth.uid() do PostgREST (ambiente, VERBATIM do teste-irmao admin_only).
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- Papeis (ambiente, mesmo contrato das migrations reais).
CREATE TYPE public.app_role AS ENUM ('admin','supervisor','agent');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_roles TO anon, authenticated, service_role;
CREATE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::app_role)
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

-- Tabelas reais (colunas VERBATIM das migrations que as criam).
CREATE TABLE public.rate_limit_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  endpoint_pattern text NOT NULL,
  max_requests integer NOT NULL DEFAULT 100,
  window_seconds integer NOT NULL DEFAULT 60,
  block_duration_minutes integer NOT NULL DEFAULT 15,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text NOT NULL,
  blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_permanent boolean DEFAULT false,
  request_count integer DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  description text,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.allowed_countries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.blocked_countries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  reason text,
  blocked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.geo_blocking_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode text NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled', 'whitelist', 'blacklist')),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Geo desligado: o foco deste teste é a política de IP.
INSERT INTO public.geo_blocking_settings (mode) VALUES ('disabled');

-- ACL de tabela que o Supabase já entrega para service_role (BYPASSRLS + GRANT).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Caminho do painel (ambiente): RLS ligada nas duas listas e DML para
-- authenticated — a barreira de QUEM escreve é a policy (is_admin), como em prod.
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_whitelist, public.blocked_ips
  TO authenticated;

-- blocked_ips: escrita admin-only (ambiente, VERBATIM da gate16
-- 20260830150000 — em prod já é assim; aqui reproduz o papel gravador).
CREATE POLICY "Admins can insert blocked IPs" ON public.blocked_ips
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update blocked IPs" ON public.blocked_ips
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete blocked IPs" ON public.blocked_ips
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Leitura da whitelist (ambiente, VERBATIM da 20251231115910 — sobrevive ao
-- PD-09, que só derrubou a manage): sem ela o scan do UPDATE como
-- authenticated não enxerga a linha (RLS) e o UPDATE casa 0 linhas, como em
-- prod sem esta policy.
CREATE POLICY "Authenticated can view IP whitelist" ON public.ip_whitelist
FOR SELECT USING (true);

-- Contrato anterior (RPC de 20261004182245) aplicado VERBATIM.
\i :mig_dir/20261004182245_resolve_network_policy_rpc.sql

-- ── Fixtures de dados ───────────────────────────────────────────────────────
-- Usuários do JWT (ambiente): ADMIN grava, SUPERVISOR é negado pela RLS.
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-11111111111a'),
  ('44444444-4444-4444-4444-44444444444d');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-11111111111a', 'admin'),
  ('44444444-4444-4444-4444-44444444444d', 'supervisor');
-- Legado inválido (existe ANTES da correção; tem de SOBREVIVER à constraint NOT VALID).
INSERT INTO public.ip_whitelist (ip_address, description) VALUES
  ('nao-e-ip-legado', 'linha legada invalida');
INSERT INTO public.blocked_ips (ip_address, reason) VALUES
  ('9.9.9.9/33-legado', 'linha legada invalida'),
  ('203.0.113.0/24', 'faixa CIDR v4'),
  ('198.51.100.5', 'host exato'),
  ('2001:db8::/32', 'faixa CIDR v6'),
  ('10.0.0.0/24', 'faixa CIDR v4 (familia)');

-- Saneamento: espaços em volta (serão limpos) e um par que colidiria na UNIQUE
-- (tem de ser preservado como está — guarda NOT EXISTS).
INSERT INTO public.ip_whitelist (ip_address, description) VALUES
  (' 192.0.2.99 ', 'com espacos — saneia'),
  (' 203.0.113.99 ', 'com espacos — colide'),
  ('203.0.113.99', 'sem espacos — vence');

CREATE TABLE pg_temp.contagem_pre AS
  SELECT (SELECT count(*) FROM public.ip_whitelist) AS w,
         (SELECT count(*) FROM public.blocked_ips)   AS b;

-- ── Helpers de execução como PAPEL REAL ─────────────────────────────────────
CREATE FUNCTION pg_temp.operacao(p_papel text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_user text; v_n bigint; v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  v_user := current_user;
  IF v_user <> p_papel THEN
    RESET ROLE;
    RETURN 'ERRO papel efetivo ' || v_user;
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := 'OK ' || v_n::text;
  EXCEPTION WHEN OTHERS THEN
    v_out := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_out;
END $$;

-- Roda p_sql como authenticated com o JWT do usuário p_uid (caminho do painel/
-- PostgREST): devolve 'OK <n>' ou 'ERRO <sqlstate> <mensagem>'.
CREATE FUNCTION pg_temp.operacao_uid(p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_n bigint; v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF current_user <> 'authenticated' THEN
    RESET ROLE;
    RETURN 'ERRO papel efetivo ' || current_user;
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := 'OK ' || v_n::text;
  EXCEPTION WHEN OTHERS THEN
    v_out := 'ERRO ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v_out;
END $$;

-- Chama resolve_network_policy como o papel pedido e devolve 'allowed/reason'.
CREATE FUNCTION pg_temp.policy(p_papel text, p_ip text, p_country text, p_endpoint text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', p_papel)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE format(
      'SELECT r.allowed::text || ''/'' || coalesce(r.reason, ''null'')
         FROM public.resolve_network_policy(%L, %L, %L, 10, 60) r',
      p_ip, p_country, p_endpoint) INTO v_out;
  EXCEPTION WHEN OTHERS THEN
    v_out := 'ERRO ' || SQLSTATE;
  END;
  RESET ROLE;
  RETURN v_out;
END $$;

CREATE TABLE pg_temp.espera (id serial PRIMARY KEY, nome text, ok boolean, visto text, quer text);
CREATE FUNCTION pg_temp.conf(p_nome text, p_visto text, p_quer text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO pg_temp.espera(nome, ok, visto, quer) VALUES (p_nome, p_visto = p_quer, p_visto, p_quer);
$$;
CREATE FUNCTION pg_temp.afirma(p_nome text, p_cond boolean) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO pg_temp.espera(nome, ok, visto, quer) VALUES (p_nome, p_cond, p_cond::text, 'true');
$$;
CREATE FUNCTION pg_temp.conf_erro(p_nome text, p_visto text, p_estado text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO pg_temp.espera(nome, ok, visto, quer)
  VALUES (p_nome, p_visto LIKE 'ERRO ' || p_estado || ' %', p_visto, 'ERRO ' || p_estado || ' ...');
$$;

-- A correcao sob teste aplicada VERBATIM (so quando nao ha sem_guarda).
\if :{?sem_guarda}
\else
  \i :mig_dir/20261014120000_network_policy_cidr.sql
\endif

-- Estado do cartao pai PD-09 (t_860cdff6), VERBATIM do arquivo real, nos dois
-- modos: escrita em ip_whitelist passa a exigir is_admin. Sem ele o BLOCO J nao
-- teria a policy que o painel usa em producao.
\i :mig_dir/20261013035213_network_policy_tables_admin_only.sql

\if :{?sem_guarda}
-- ── BLOCO R — VERMELHO: exige o DEFEITO (sem a correção) ────────────────────
SELECT pg_temp.conf('R-A faixa CIDR NAO bloqueia (defeito)',
  pg_temp.policy('service_role', '203.0.113.9', 'BR', '/login'), 'true/null');
SELECT pg_temp.conf('R-B gravacao invalida ACEITA (defeito)',
  pg_temp.operacao('service_role', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('10.0.0.0/33')$$), 'OK 1');
SELECT pg_temp.afirma('R-C helper ip_entry_matches ausente',
  NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ip_entry_matches'));
SELECT pg_temp.conf('R-D admin grava invalido e PASSA (sem CHECK, defeito)',
  pg_temp.operacao_uid('11111111-1111-1111-1111-11111111111a', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('10.0.0.0/34')$$), 'OK 1');
SELECT pg_temp.conf_erro('R-E validador ausente para authenticated (sem a correcao)',
  pg_temp.operacao('authenticated', $$SELECT public.is_valid_ip_or_cidr('10.0.0.1')$$), '42883');
\else
-- ── BLOCO A — faixa CIDR na lista de BLOQUEIO ───────────────────────────────
SELECT pg_temp.conf('A1 IP dentro da faixa bloqueado',
  pg_temp.policy('service_role', '203.0.113.9', 'BR', '/login'), 'false/ip_blocked');
SELECT pg_temp.conf('A2 IP fora da faixa permitido',
  pg_temp.policy('service_role', '203.0.114.9', 'BR', '/login'), 'true/null');

-- ── BLOCO B — faixa CIDR na WHITELIST isenta o bloqueio ─────────────────────
INSERT INTO public.ip_whitelist (ip_address, description) VALUES ('203.0.113.0/24', 'faixa v4 isenta');
SELECT pg_temp.conf('B1 faixa na whitelist isenta IP dentro dela',
  pg_temp.policy('service_role', '203.0.113.9', 'BR', '/login'), 'true/null');

-- ── BLOCO C — IP exato continua (comportamento anterior) ────────────────────
SELECT pg_temp.conf('C1 host exato bloqueado',
  pg_temp.policy('service_role', '198.51.100.5', 'BR', '/login'), 'false/ip_blocked');
SELECT pg_temp.conf('C2 outro host do /24 permitido',
  pg_temp.policy('service_role', '198.51.100.6', 'BR', '/login'), 'true/null');

-- ── BLOCO D — IPv6 ──────────────────────────────────────────────────────────
SELECT pg_temp.conf('D1 IPv6 dentro da faixa bloqueado',
  pg_temp.policy('service_role', '2001:db8:1234::1', 'BR', '/login'), 'false/ip_blocked');
SELECT pg_temp.conf('D2 IPv6 fora da faixa permitido',
  pg_temp.policy('service_role', '2001:db9::1', 'BR', '/login'), 'true/null');
INSERT INTO public.ip_whitelist (ip_address, description) VALUES ('2001:db8:1::/48', 'faixa v6 isenta');
SELECT pg_temp.conf('D3 faixa IPv6 na whitelist isenta dentro dela',
  pg_temp.policy('service_role', '2001:db8:1:2::5', 'BR', '/login'), 'true/null');

-- ── BLOCO E — famílias diferentes nunca se contêm (e nunca lançam) ──────────
SELECT pg_temp.conf('E1 IPv4 dentro de faixa IPv4 segue bloqueado',
  pg_temp.policy('service_role', '10.0.0.7', 'BR', '/login'), 'false/ip_blocked');
SELECT pg_temp.conf('E2 IPv6 fora de qualquer faixa v6 (comparacao mista nao lanca)',
  pg_temp.policy('service_role', '2001:db9::1', 'BR', '/login'), 'true/null');
SELECT pg_temp.conf('E3 IPv6 sem faixa correspondente segue permitido',
  pg_temp.policy('service_role', 'fe80::1', 'BR', '/login'), 'true/null');
SELECT pg_temp.conf('E4 IP de entrada ilegivel nao explode e nao casa (permitido)',
  pg_temp.policy('service_role', 'texto-invalido', 'BR', '/login'), 'true/null');

-- ── BLOCO F/G — CHECK recusa inválido; válido passa; legado sobrevive ───────
SELECT pg_temp.conf_erro('F1 ip_whitelist recusa /33',
  pg_temp.operacao('service_role', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('10.0.0.0/33')$$), '23514');
SELECT pg_temp.conf_erro('F2 blocked_ips recusa 999.1.1.1',
  pg_temp.operacao('service_role', $$INSERT INTO public.blocked_ips (ip_address, reason) VALUES ('999.1.1.1', 'x')$$), '23514');
SELECT pg_temp.conf_erro('F3 ip_whitelist recusa texto',
  pg_temp.operacao('service_role', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('nao-e-ip')$$), '23514');
SELECT pg_temp.conf_erro('F4 ip_whitelist recusa vazio',
  pg_temp.operacao('service_role', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('   ')$$), '23514');
SELECT pg_temp.conf('F5 grava CIDR valido',
  pg_temp.operacao('service_role', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('172.16.0.0/12')$$), 'OK 1');
SELECT pg_temp.conf('F6 grava IPv6 valido',
  pg_temp.operacao('service_role', $$INSERT INTO public.blocked_ips (ip_address, reason) VALUES ('fe80::/10', 'v6')$$), 'OK 1');

SELECT pg_temp.afirma('G1 nada foi apagado: contagem = anteriores + insercoes validas',
  (SELECT w FROM pg_temp.contagem_pre) + 3 = (SELECT count(*) FROM public.ip_whitelist)
  AND (SELECT b FROM pg_temp.contagem_pre) + 1 = (SELECT count(*) FROM public.blocked_ips));
SELECT pg_temp.afirma('G2 linha legada invalida permanece (NOT VALID)',
  EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip_address = 'nao-e-ip-legado')
  AND EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip_address = '9.9.9.9/33-legado'));
SELECT pg_temp.afirma('G3 constraints existem e sao NOT VALID',
  NOT (SELECT convalidated FROM pg_constraint WHERE conname = 'ip_whitelist_ip_address_valid')
  AND NOT (SELECT convalidated FROM pg_constraint WHERE conname = 'blocked_ips_ip_address_valid'));

-- ── BLOCO H — saneamento de espaços sem colisão com a UNIQUE ────────────────
SELECT pg_temp.afirma('H1 espaco removido do IP valido',
  EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip_address = '192.0.2.99')
  AND NOT EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip_address = ' 192.0.2.99 '));
SELECT pg_temp.afirma('H2 par que colidiria foi preservado (guarda NOT EXISTS)',
  EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip_address = ' 203.0.113.99 ')
  AND EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip_address = '203.0.113.99'));

-- ── BLOCO J — admin do painel grava (PONTO 2 da recusa t_ab5db6ee) ──────────
-- authenticated + JWT de admin, com as policies do PD-09: CIDR válido passa
-- (INSERT e UPDATE, sem 42501) e inválido leva 23514 (não 42501). Supervisor
-- negado pela RLS. Mesma cobertura em blocked_ips (PONTO 1: mesmo papel).
SELECT pg_temp.conf('J1 admin INSERT CIDR valido em ip_whitelist',
  pg_temp.operacao_uid('11111111-1111-1111-1111-11111111111a', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('192.0.2.0/24')$$), 'OK 1');
SELECT pg_temp.conf('J2 admin UPDATE para CIDR valido em ip_whitelist',
  pg_temp.operacao_uid('11111111-1111-1111-1111-11111111111a', $$UPDATE public.ip_whitelist SET ip_address = '198.51.100.0/24' WHERE ip_address = '192.0.2.0/24'$$), 'OK 1');
SELECT pg_temp.conf_erro('J3 admin INSERT invalido leva 23514 (nao 42501)',
  pg_temp.operacao_uid('11111111-1111-1111-1111-11111111111a', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('10.0.0.0/33')$$), '23514');
SELECT pg_temp.conf('J4 admin INSERT CIDR valido em blocked_ips',
  pg_temp.operacao_uid('11111111-1111-1111-1111-11111111111a', $$INSERT INTO public.blocked_ips (ip_address, reason) VALUES ('203.0.113.128/25', 'faixa admin')$$), 'OK 1');
SELECT pg_temp.conf_erro('J5 admin INSERT invalido em blocked_ips leva 23514 (nao 42501)',
  pg_temp.operacao_uid('11111111-1111-1111-1111-11111111111a', $$INSERT INTO public.blocked_ips (ip_address, reason) VALUES ('999.1.1.1', 'x')$$), '23514');
SELECT pg_temp.afirma('J6 supervisor negado pela RLS em ip_whitelist',
  pg_temp.operacao_uid('44444444-4444-4444-4444-44444444444d', $$INSERT INTO public.ip_whitelist (ip_address) VALUES ('198.51.101.0/24')$$)
  LIKE 'ERRO 42501 %row-level security policy%');
SELECT pg_temp.afirma('J7 supervisor negado pela RLS em blocked_ips',
  pg_temp.operacao_uid('44444444-4444-4444-4444-44444444444d', $$INSERT INTO public.blocked_ips (ip_address, reason) VALUES ('198.51.102.0/24', 'x')$$)
  LIKE 'ERRO 42501 %row-level security policy%');

-- ── BLOCO I — ACL final (PONTO 3 da recusa t_ab5db6ee) ────────────────────────
-- RPC e ip_entry_matches: só service_role. Validador: anon SEM acesso (I3
-- mantida) e authenticated COM acesso (I6, o GRANT da correção — sem ele o
-- admin levaria 42501 na CHECK).
SELECT pg_temp.conf('I1 authenticated nao executa a RPC',
  pg_temp.policy('authenticated', '203.0.113.9', 'BR', '/login'), 'ERRO 42501');
SELECT pg_temp.conf('I2 anon nao executa a RPC',
  pg_temp.policy('anon', '203.0.113.9', 'BR', '/login'), 'ERRO 42501');
SELECT pg_temp.conf_erro('I3 anon nao executa is_valid_ip_or_cidr',
  pg_temp.operacao('anon', $$SELECT public.is_valid_ip_or_cidr('10.0.0.1')$$), '42501');
SELECT pg_temp.conf_erro('I4 anon nao executa ip_entry_matches',
  pg_temp.operacao('anon', $$SELECT public.ip_entry_matches('10.0.0.0/24', '10.0.0.1'::inet)$$), '42501');
SELECT pg_temp.conf('I5 service_role executa os helpers',
  pg_temp.operacao('service_role', $$SELECT public.ip_entry_matches('10.0.0.0/24', '10.0.0.1'::inet)$$), 'OK 1');
SELECT pg_temp.conf('I6 authenticated EXECUTA is_valid_ip_or_cidr (GRANT da correcao)',
  pg_temp.operacao('authenticated', $$SELECT public.is_valid_ip_or_cidr('10.0.0.1')$$), 'OK 1');
\endif

-- ── Relatório ───────────────────────────────────────────────────────────────
SELECT nome, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END AS resultado, visto, quer
  FROM pg_temp.espera ORDER BY id;

DO $$
DECLARE v_total integer; v_falhas integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT ok) INTO v_total, v_falhas FROM pg_temp.espera;
  IF v_falhas > 0 THEN
    RAISE EXCEPTION 'TESTE FALHOU: % de % assercoes vermelhas', v_falhas, v_total;
  END IF;
  RAISE NOTICE 'TESTE VERDE: % assercoes', v_total;
END $$;

ROLLBACK;
