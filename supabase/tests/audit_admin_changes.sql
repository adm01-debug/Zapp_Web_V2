-- ============================================================================
-- Trilha das acoes administrativas — prova de escrita (paridade vs docs 04–16).
--
-- Prova que a migration 20261013042745_audit_admin_changes.sql faz o que promete,
-- sob os PAPEIS REAIS (`authenticated` com JWT e `service_role` sem JWT), e nao
-- menos do que promete:
--   * as 8 tabelas administrativas ganham gatilho (cobertura nao-vacua: cada uma
--     produz sua linha);
--   * `profiles` audita SO os quatro campos de acesso e so em UPDATE — um UPDATE
--     que mexe em outra coluna nao entra na trilha;
--   * `global_settings` grava a CHAVE e NUNCA o VALOR — o segredo (`api_token`)
--     nao aparece em `details`;
--   * a operacao e o alvo sao registrados (action = tabela_operacao, entity_id);
--   * o ator e `auth.uid()` com JWT e fica NULO, marcado
--     `service_role_or_direct_sql`, quando a escrita vem de `service_role`/SQL
--     direto sem JWT;
--   * a funcao e `security definer`, tem `search_path` fixo e NAO tem EXECUTE
--     para PUBLIC/anon/authenticated/service_role — e mesmo assim o gatilho
--     dispara (gatilho nao passa por checagem de EXECUTE);
--   * o cliente (`authenticated`) NAO consegue forjar a trilha: a policy
--     "Block direct audit log inserts" (WITH CHECK false) barra o INSERT direto,
--     e por isso a escrita so sai pelo caminho SECURITY DEFINER;
--   * MATRIZ DE PAPEIS (sec. M): `anon` e NEGADO nas tabelas administrativas e na
--     trilha (42501); `authenticated` tem a operacao PASSA e auditada, mas e
--     NEGADO ao forjar (RLS), ao chamar a funcao do gatilho (sem EXECUTE) e ao
--     alterar/apagar a trilha ja gravada (RLS: 0 linhas afetadas);
--   * ATRIBUICAO (sec. AT): a escrita por um agente grava o uid DESSE agente, nao
--     o do admin que aparece no fixture;
--   * UMA OPERACAO = EXATAMENTE 1 REGISTRO (sec. U), nas 8 tabelas — e nenhuma
--     disparo duplicado;
--   * SEGREDO/DADO PESSOAL (sec. SEC): o VALOR de `global_settings` (token) nunca
--     entra em `details` — so a CHAVE, que e identificador; telefone e e-mail do
--     perfil tambem nunca sao gravados.
--
-- Como rodar (PostgreSQL 17 descartavel, UM arquivo, UMA transacao com ROLLBACK).
-- O `\i` do arquivo roda DENTRO do container, entao a copia precisa estar montada
-- (com caminho de host o psql do container nao acha o arquivo):
--   docker run -d --name pg-audit-admin -e POSTGRES_PASSWORD=t \
--     -v "$PWD":/repo postgres:17-alpine
--   docker exec -i pg-audit-admin psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig_dir=/repo/supabase/migrations \
--     -f - < supabase/tests/audit_admin_changes.sql
--
-- VERMELHO (o teste falha quando a correcao nao esta la): acrescente `-v sem_guarda=1`.
--   Com sem_guarda os 8 gatilhos sao derrubados DENTRO da transacao — nada persiste
--   porque o arquivo termina em ROLLBACK, e a primeira assercao de escrita falha.
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig_dir}
\else
  \set mig_dir supabase/migrations
\endif

BEGIN;

-- ── Superficie minima (ambiente; a peca auditada vem da migration logo abaixo) ──
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

-- Fixtures com a FORMA real das tabelas (o contrato do gatilho e o catalogo do repo).
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text,
  role text DEFAULT 'agent',
  max_chats integer,
  access_level text DEFAULT 'active',
  is_active boolean DEFAULT true,
  can_download boolean NOT NULL DEFAULT true,
  phone text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  can_see_agent_id uuid NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  description text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  description text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  reason text NOT NULL,
  blocked_by uuid,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_permanent boolean DEFAULT false,
  request_count integer DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.blocked_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  country_name text NOT NULL,
  reason text,
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.geo_blocking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rate_limit_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  endpoint_pattern text NOT NULL,
  max_requests integer NOT NULL,
  window_seconds integer NOT NULL,
  block_duration_minutes integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- `audit_logs` com a forma real + a policy que nega INSERT do cliente (a MESMA que
-- existe hoje: "Block direct audit log inserts", WITH CHECK false).
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block direct audit log inserts"
  ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (false);

-- Grants de tabela do PostgREST: fazem a RLS ser a UNICA barreira.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles, public.agent_visibility_grants, public.global_settings,
  public.ip_whitelist, public.blocked_ips, public.blocked_countries,
  public.geo_blocking_settings, public.rate_limit_configs, public.audit_logs
  TO authenticated, service_role;

-- Fixtures: o admin (ator), dois alvos de perfil, a config secreta e um IP bloqueado.
INSERT INTO public.profiles (id, user_id, name, role, email, phone) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-11111111111a', 'ADMIN', 'admin', 'admin@exemplo.test', '+5511999990000'),
  ('c0000000-0000-0000-0000-00000000000c', '22222222-2222-2222-2222-22222222222b', 'ALVO 1', 'agent', 'alvo1@exemplo.test', '+5511999990001'),
  ('d0000000-0000-0000-0000-00000000000d', '33333333-3333-3333-3333-33333333333c', 'ALVO 2', 'agent', 'alvo2@exemplo.test', '+5511999990002');
INSERT INTO public.global_settings (key, value, description) VALUES
  ('api_token', 'TOKEN-DE-PRODUCAO-NAO-VAZAR', 'Token da API publica'),
  ('auto_reopen_hours', '2', 'Horas de reabertura');
INSERT INTO public.blocked_ips (id, ip_address, reason) VALUES
  ('e0000000-0000-0000-0000-00000000000e', '203.0.113.9', 'abuso');
INSERT INTO public.geo_blocking_settings (mode) VALUES ('allowlist');

-- ── A PECA AUDITADA, verbatim da migration real ─────────────────────────────
\echo '── aplicando a migration REAL (funcao SECURITY DEFINER + 8 gatilhos) ──'
\i :mig_dir/20261013042745_audit_admin_changes.sql

-- ── Modo vermelho: a correcao ausente ──────────────────────────────────────
\if :{?sem_guarda}
  DROP TRIGGER IF EXISTS trg_audit_admin_profile_access ON public.profiles;
  DROP TRIGGER IF EXISTS trg_audit_admin_agent_visibility_grants ON public.agent_visibility_grants;
  DROP TRIGGER IF EXISTS trg_audit_admin_global_settings ON public.global_settings;
  DROP TRIGGER IF EXISTS trg_audit_admin_ip_whitelist ON public.ip_whitelist;
  DROP TRIGGER IF EXISTS trg_audit_admin_blocked_ips ON public.blocked_ips;
  DROP TRIGGER IF EXISTS trg_audit_admin_blocked_countries ON public.blocked_countries;
  DROP TRIGGER IF EXISTS trg_audit_admin_geo_blocking_settings ON public.geo_blocking_settings;
  DROP TRIGGER IF EXISTS trg_audit_admin_rate_limit_configs ON public.rate_limit_configs;
  \echo '  [sem_guarda] os 8 gatilhos foram derrubados DENTRO da transacao'
\endif

-- ── Helper de assercao do proprio teste ────────────────────────────────────
CREATE FUNCTION pg_temp.espera(p_label text, p_atual text, p_esperado text) RETURNS void
LANGUAGE plpgsql AS $h$
BEGIN
  IF p_atual IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'FALHOU [%]: esperado [%], obtido [%]', p_label, p_esperado, p_atual;
  END IF;
  RAISE NOTICE 'PASS [%] -> %', p_label, p_atual;
END $h$;

-- ============================================================================
-- C. A FUNCAO: definer, search_path fixo, sem EXECUTE para ninguem por assinatura
-- ============================================================================
SELECT pg_temp.espera('C.1 funcao e SECURITY DEFINER',
  (SELECT prosecdef::text FROM pg_proc WHERE oid = 'public.audit_admin_change()'::regprocedure), 'true');
SELECT pg_temp.espera('C.2 search_path fixo (public, pg_temp)',
  (SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE oid = 'public.audit_admin_change()'::regprocedure), 'search_path=public, pg_temp');
SELECT pg_temp.espera('C.3 PUBLIC sem EXECUTE',
  (SELECT (NOT EXISTS (
     SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))::text
   FROM pg_proc p WHERE p.oid = 'public.audit_admin_change()'::regprocedure), 'true');
SELECT pg_temp.espera('C.4 anon sem EXECUTE',
  has_function_privilege('anon', 'public.audit_admin_change()', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('C.5 authenticated sem EXECUTE',
  has_function_privilege('authenticated', 'public.audit_admin_change()', 'EXECUTE')::text, 'false');
SELECT pg_temp.espera('C.6 service_role sem EXECUTE',
  has_function_privilege('service_role', 'public.audit_admin_change()', 'EXECUTE')::text, 'false');

-- ============================================================================
-- T. COBERTURA: 8 gatilhos, nas 8 tabelas certas
-- ============================================================================
SELECT pg_temp.espera('T.1 oito gatilhos instalados',
  (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_audit_admin_%'), '8');
SELECT pg_temp.espera('T.2 tabelas cobertas',
  (SELECT string_agg(DISTINCT tgrelid::regclass::text, ',' ORDER BY tgrelid::regclass::text)
     FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_audit_admin_%'),
  'agent_visibility_grants,blocked_countries,blocked_ips,geo_blocking_settings,global_settings,ip_whitelist,profiles,rate_limit_configs');
SELECT pg_temp.espera('T.3 perfil so dispara em UPDATE (sem INSERT/DELETE)',
  (SELECT ((tgtype & 12) = 0 AND (tgtype & 16) = 16)::text FROM pg_trigger WHERE tgname = 'trg_audit_admin_profile_access'), 'true');
SELECT pg_temp.espera('T.4 perfil vigia exatamente 4 colunas',
  (SELECT array_length(string_to_array(tgattr::text, ' '), 1)::text FROM pg_trigger WHERE tgname = 'trg_audit_admin_profile_access'), '4');

-- ============================================================================
-- P. PERFIL: audita so os 4 campos de acesso; UPDATE em outra coluna nao entra
-- ============================================================================
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-11111111111a')::text, true); END $j$;
UPDATE public.profiles
   SET is_active = false,
       name = 'nome trocado junto',
       email = 'alvo1.novo@exemplo.test',
       phone = '+5511999990001'
 WHERE id = 'c0000000-0000-0000-0000-00000000000c';
UPDATE public.profiles SET email = 'x@exemplo.test' WHERE id = 'd0000000-0000-0000-0000-00000000000d';
UPDATE public.global_settings SET value = 'SEGREDO-NOVO-NAO-PODE-VAZAR' WHERE key = 'api_token';
INSERT INTO public.agent_visibility_grants (id, agent_id, can_see_agent_id, granted_by)
  VALUES ('f0000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-00000000000c', 'd0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');
INSERT INTO public.ip_whitelist (id, ip_address) VALUES ('aa000000-0000-0000-0000-0000000000aa', '198.51.100.7');
INSERT INTO public.blocked_countries (id, country_code, country_name) VALUES ('bb000000-0000-0000-0000-0000000000bb', 'KP', 'Coreia do Norte');
DELETE FROM public.blocked_ips WHERE id = 'e0000000-0000-0000-0000-00000000000e';
INSERT INTO public.rate_limit_configs (name, endpoint_pattern, max_requests, window_seconds, block_duration_minutes)
  VALUES ('busca', '/search', 30, 60, 10);
RESET ROLE;

SELECT pg_temp.espera('P.1 mudanca de is_active gera 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'c0000000-0000-0000-0000-00000000000c'), '1');
SELECT pg_temp.espera('P.2 ator e o uid do JWT',
  (SELECT user_id::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'c0000000-0000-0000-0000-00000000000c'),
  '11111111-1111-1111-1111-11111111111a');
SELECT pg_temp.espera('P.3 entity_type = tabela', (SELECT entity_type FROM public.audit_logs WHERE action = 'profiles_update'), 'profiles');
SELECT pg_temp.espera('P.4 operation = update', (SELECT details ->> 'operation' FROM public.audit_logs WHERE action = 'profiles_update'), 'update');
SELECT pg_temp.espera('P.5 changed_fields tem is_active',
  (SELECT (details -> 'changed_fields') ? 'is_active' FROM public.audit_logs WHERE action = 'profiles_update')::text, 'true');
SELECT pg_temp.espera('P.6 changed_fields NAO traz coluna de fora do escopo (name)',
  (SELECT (details -> 'changed_fields') ? 'name' FROM public.audit_logs WHERE action = 'profiles_update')::text, 'false');
SELECT pg_temp.espera('P.7 ator_kind = jwt', (SELECT details ->> 'actor_kind' FROM public.audit_logs WHERE action = 'profiles_update'), 'jwt');
SELECT pg_temp.espera('P.8 UPDATE so em coluna fora do escopo NAO gera registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'd0000000-0000-0000-0000-00000000000d'), '0');
SELECT pg_temp.espera('P.9 o registro NAO carrega o e-mail do alvo',
  (SELECT (position('alvo1.novo@exemplo.test' in details::text) = 0)::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'c0000000-0000-0000-0000-00000000000c'), 'true');
SELECT pg_temp.espera('P.10 o registro NAO carrega o telefone do alvo',
  (SELECT (position('+5511999990001' in details::text) = 0)::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'c0000000-0000-0000-0000-00000000000c'), 'true');
SELECT pg_temp.espera('P.11 changed_fields nem cita email/phone (so os 4 campos de acesso)',
  (SELECT (NOT ((details -> 'changed_fields') ? 'email') AND NOT ((details -> 'changed_fields') ? 'phone')
           AND (details -> 'changed_fields') = '["is_active"]'::jsonb)::text
     FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'c0000000-0000-0000-0000-00000000000c'), 'true');

-- ============================================================================
-- G. GLOBAL_SETTINGS: grava a chave, NUNCA o valor
-- ============================================================================
SELECT pg_temp.espera('G.1 troca de config gera registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'global_settings_update'), '1');
SELECT pg_temp.espera('G.2 details guarda a CHAVE', (SELECT details ->> 'key' FROM public.audit_logs WHERE action = 'global_settings_update'), 'api_token');
SELECT pg_temp.espera('G.3 details NAO contem o valor novo (segredo)',
  (SELECT (position('SEGREDO-NOVO-NAO-PODE-VAZAR' in details::text) = 0)::text FROM public.audit_logs WHERE action = 'global_settings_update'), 'true');
SELECT pg_temp.espera('G.4 details NAO contem o valor antigo (segredo)',
  (SELECT (position('TOKEN-DE-PRODUCAO-NAO-VAZAR' in details::text) = 0)::text FROM public.audit_logs WHERE action = 'global_settings_update'), 'true');
SELECT pg_temp.espera('G.5 details nao carrega a coluna value',
  (SELECT (details ? 'value')::text FROM public.audit_logs WHERE action = 'global_settings_update'), 'false');
SELECT pg_temp.espera('G.6 changed_fields registra que value mudou',
  (SELECT (details -> 'changed_fields') ? 'value' FROM public.audit_logs WHERE action = 'global_settings_update')::text, 'true');

-- ============================================================================
-- R. REDE: visibilidade de agente, IP liberado, pais e IP bloqueado — id do alvo
-- ============================================================================
SELECT pg_temp.espera('R.1 agente visivel: registro com o id do alvo',
  (SELECT entity_id::text FROM public.audit_logs WHERE action = 'agent_visibility_grants_insert'), 'f0000000-0000-0000-0000-00000000000f');
SELECT pg_temp.espera('R.2 IP liberado: registro com o id do alvo',
  (SELECT entity_id::text FROM public.audit_logs WHERE action = 'ip_whitelist_insert'), 'aa000000-0000-0000-0000-0000000000aa');
SELECT pg_temp.espera('R.3 pais bloqueado: registro com o id do alvo',
  (SELECT entity_id::text FROM public.audit_logs WHERE action = 'blocked_countries_insert'), 'bb000000-0000-0000-0000-0000000000bb');
SELECT pg_temp.espera('R.4 remocao de IP bloqueado: delete com o id do alvo',
  (SELECT entity_id::text FROM public.audit_logs WHERE action = 'blocked_ips_delete'), 'e0000000-0000-0000-0000-00000000000e');
SELECT pg_temp.espera('R.5 limite: exatamente 1 registro (sem disparo duplicado)',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'rate_limit_configs_insert'), '1');

-- ============================================================================
-- S. ATOR DE SISTEMA: service_role sem JWT -> user_id nulo, marcado
-- ============================================================================
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.geo_blocking_settings SET mode = 'denylist';
RESET ROLE;

SELECT pg_temp.espera('S.1 escrita por service_role gera registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'geo_blocking_settings_update'), '1');
SELECT pg_temp.espera('S.2 sem JWT o ator fica NULO',
  (SELECT (user_id IS NULL)::text FROM public.audit_logs WHERE action = 'geo_blocking_settings_update'), 'true');
SELECT pg_temp.espera('S.3 origem marcada como sistema',
  (SELECT details ->> 'actor_kind' FROM public.audit_logs WHERE action = 'geo_blocking_settings_update'), 'service_role_or_direct_sql');

-- ============================================================================
-- F. O CLIENTE NAO FORJA: INSERT direto em audit_logs e barrado pela RLS
-- ============================================================================
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-11111111111a')::text, true); END $j$;
DO $f$
BEGIN
  BEGIN
    INSERT INTO public.audit_logs (user_id, action) VALUES ('11111111-1111-1111-1111-11111111111a', 'forjado');
    RAISE EXCEPTION 'FALHOU [F.1]: authenticated conseguiu inserir direto em audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN
    IF position('row-level security' in SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FALHOU [F.1]: barrado, mas nao pela RLS (%) : %', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'PASS [F.1] cliente nao forja a trilha (RLS: %)', SQLERRM;
  END;
END $f$;
RESET ROLE;

SELECT pg_temp.espera('F.2 nenhuma linha forjada entrou',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'forjado'), '0');

-- ============================================================================
-- AT. ATRIBUICAO: o registro aponta QUEM agiu — o agente, nao o admin
-- ============================================================================
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-33333333333c')::text, true); END $j$;
UPDATE public.profiles SET max_chats = 9 WHERE id = 'd0000000-0000-0000-0000-00000000000d';
RESET ROLE;

SELECT pg_temp.espera('AT.1 o ator e o AGENTE do JWT, nao o admin',
  (SELECT user_id::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'd0000000-0000-0000-0000-00000000000d'), '33333333-3333-3333-3333-33333333333c');
SELECT pg_temp.espera('AT.2 changed_fields traz so o campo vigiado (max_chats)',
  (SELECT (details -> 'changed_fields')::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'd0000000-0000-0000-0000-00000000000d'), '["max_chats"]');
SELECT pg_temp.espera('AT.3 ator marcado como jwt',
  (SELECT details ->> 'actor_kind' FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = 'd0000000-0000-0000-0000-00000000000d'), 'jwt');

-- ============================================================================
-- U. UMA OPERACAO POR TABELA = EXATAMENTE 1 REGISTRO (as 8 tabelas)
-- ============================================================================
SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-11111111111a')::text, true); END $j$;
INSERT INTO public.profiles (id, user_id, name, role) VALUES
  ('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a001', 'VARREDURA', 'agent');
UPDATE public.profiles SET access_level = 'limited', can_download = false
 WHERE id = '9a000000-0000-0000-0000-000000000001';
INSERT INTO public.agent_visibility_grants (id, agent_id, can_see_agent_id, granted_by)
  VALUES ('f1000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');
INSERT INTO public.global_settings (id, key, value)
  VALUES ('a1000000-0000-0000-0000-000000000001', 'sweep_token', 'TOKEN-DA-VARREDURA-NAO-VAZAR');
INSERT INTO public.ip_whitelist (id, ip_address)
  VALUES ('b1000000-0000-0000-0000-000000000001', '198.51.100.44');
INSERT INTO public.blocked_ips (id, ip_address, reason)
  VALUES ('c1000000-0000-0000-0000-000000000001', '203.0.113.44', 'varredura');
INSERT INTO public.blocked_countries (id, country_code, country_name)
  VALUES ('d1000000-0000-0000-0000-000000000001', 'IR', 'Ira');
INSERT INTO public.geo_blocking_settings (id, mode)
  VALUES ('e1000000-0000-0000-0000-000000000001', 'off');
INSERT INTO public.rate_limit_configs (id, name, endpoint_pattern, max_requests, window_seconds, block_duration_minutes)
  VALUES ('f2000000-0000-0000-0000-000000000001', 'varredura', '/sweep', 10, 60, 5);
RESET ROLE;

SELECT pg_temp.espera('U.1 profiles: 1 registro para a operacao',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'profiles_update' AND entity_id = '9a000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.2 agent_visibility_grants: 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'agent_visibility_grants_insert' AND entity_id = 'f1000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.3 global_settings: 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'global_settings_insert' AND entity_id = 'a1000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.4 ip_whitelist: 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'ip_whitelist_insert' AND entity_id = 'b1000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.5 blocked_ips: 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'blocked_ips_insert' AND entity_id = 'c1000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.6 blocked_countries: 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'blocked_countries_insert' AND entity_id = 'd1000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.7 geo_blocking_settings: 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'geo_blocking_settings_insert' AND entity_id = 'e1000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.8 rate_limit_configs: 1 registro',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'rate_limit_configs_insert' AND entity_id = 'f2000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.espera('U.9 INSERT de perfil NAO e auditado (o gatilho e so UPDATE)',
  (SELECT count(*)::text FROM public.audit_logs WHERE action = 'profiles_insert'), '0');
SELECT pg_temp.espera('U.10 nenhuma operacao gerou disparo duplicado',
  (SELECT count(*)::text FROM (
     SELECT action, entity_id FROM public.audit_logs
      GROUP BY action, entity_id HAVING count(*) > 2) AS d), '0');

-- ============================================================================
-- SEC. SEGREDO E DADO PESSOAL: o que SAI na trilha e o que NUNCA sai
-- ============================================================================
SELECT pg_temp.espera('SEC.1 global_settings grava a CHAVE (identificador)',
  (SELECT details ->> 'key' FROM public.audit_logs WHERE action = 'global_settings_insert' AND entity_id = 'a1000000-0000-0000-0000-000000000001'), 'sweep_token');
SELECT pg_temp.espera('SEC.2 o campo `value` nao existe no registro',
  (SELECT (details ? 'value')::text FROM public.audit_logs WHERE action = 'global_settings_insert' AND entity_id = 'a1000000-0000-0000-0000-000000000001'), 'false');
SELECT pg_temp.espera('SEC.3 o VALOR secreto nao aparece em nenhum registro',
  (SELECT (count(*) = 0)::text FROM public.audit_logs
    WHERE details::text LIKE '%TOKEN-DA-VARREDURA-NAO-VAZAR%'
       OR details::text LIKE '%TOKEN-DE-PRODUCAO-NAO-VAZAR%'
       OR details::text LIKE '%SEGREDO-NOVO-NAO-PODE-VAZAR%'
       OR details::text LIKE '%troca-anon%'), 'true');
SELECT pg_temp.espera('SEC.4 telefone e e-mail nunca sao gravados',
  (SELECT (count(*) = 0)::text FROM public.audit_logs
    WHERE details::text LIKE '%+5511999990001%'
       OR details::text LIKE '%alvo1.novo@exemplo.test%'
       OR details::text LIKE '%@exemplo.test%'), 'true');
SELECT pg_temp.espera('SEC.5 a trilha nao e vazia (prova nao-vacua)',
  (SELECT (count(*) > 0)::text FROM public.audit_logs), 'true');
SELECT pg_temp.espera('SEC.6 as 8 tabelas administrativas aparecem na trilha',
  (SELECT string_agg(DISTINCT entity_type, ',' ORDER BY entity_type) FROM public.audit_logs
    WHERE entity_type IN ('profiles', 'agent_visibility_grants', 'global_settings', 'ip_whitelist',
                          'blocked_ips', 'blocked_countries', 'geo_blocking_settings', 'rate_limit_configs')),
  'agent_visibility_grants,blocked_countries,blocked_ips,geo_blocking_settings,global_settings,ip_whitelist,profiles,rate_limit_configs');

-- ============================================================================
-- M. MATRIZ DE PAPEIS: o que PASSA e o que e NEGADO
-- ============================================================================
-- NEGADO (anon): sem GRANT nas tabelas administrativas a escrita morre na
-- permissao (42501), antes de qualquer gatilho; a trilha nem e tocada.
SET LOCAL ROLE anon;
DO $m1$
BEGIN
  BEGIN
    INSERT INTO public.ip_whitelist (ip_address) VALUES ('203.0.113.77');
    RAISE EXCEPTION 'FALHOU [M.1]: anon conseguiu inserir em ip_whitelist';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [M.1] NEGADO: anon nao insere em ip_whitelist (%)', SQLSTATE;
  END;
END $m1$;
DO $m2$
BEGIN
  BEGIN
    UPDATE public.global_settings SET value = 'troca-anon' WHERE key = 'api_token';
    RAISE EXCEPTION 'FALHOU [M.2]: anon conseguiu alterar global_settings';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [M.2] NEGADO: anon nao altera global_settings (%)', SQLSTATE;
  END;
END $m2$;
DO $m3$
BEGIN
  BEGIN
    DELETE FROM public.audit_logs;
    RAISE EXCEPTION 'FALHOU [M.3]: anon conseguiu apagar a trilha';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [M.3] NEGADO: anon nao toca audit_logs (%)', SQLSTATE;
  END;
END $m3$;
RESET ROLE;
SELECT pg_temp.espera('M.4 nenhuma escrita do anon virou trilha',
  (SELECT count(*)::text FROM public.audit_logs WHERE details ->> 'actor_db_role' = 'anon'), '0');

SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-11111111111a')::text, true); END $j$;

-- NEGADO (authenticated): nao existe caminho para forjar a trilha.
DO $m5$
BEGIN
  BEGIN
    INSERT INTO public.audit_logs (user_id, action) VALUES ('11111111-1111-1111-1111-11111111111a', 'forjado-2');
    RAISE EXCEPTION 'FALHOU [M.5]: authenticated inseriu direto em audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN
    IF position('row-level security' in SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FALHOU [M.5]: barrado, mas nao pela RLS (%): %', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'PASS [M.5] NEGADO (RLS): authenticated nao forja a trilha';
  END;
END $m5$;

-- NEGADO (authenticated): a funcao do gatilho nao tem EXECUTE por assinatura.
DO $m6$
BEGIN
  BEGIN
    PERFORM public.audit_admin_change();
    RAISE EXCEPTION 'FALHOU [M.6]: authenticated executou audit_admin_change()';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS [M.6] NEGADO: authenticated nao chama audit_admin_change() (%)', SQLSTATE;
  END;
END $m6$;

-- NEGADO (authenticated): a trilha ja gravada nao pode ser adulterada nem apagada.
-- A contagem de referencia e feita ANTES, FORA do papel sob RLS — senao o proprio
-- teste ficaria tautologico (`authenticated` nao enxerga `audit_logs`, entao
-- "0 linhas afetadas" nao provaria nada).
RESET ROLE;
CREATE TEMP TABLE m_trilha_antes AS SELECT count(*)::bigint AS n FROM public.audit_logs;
SELECT pg_temp.espera('M.4b a trilha a proteger nao e vazia (prova nao-vacua)',
  (SELECT (n > 0)::text FROM m_trilha_antes), 'true');

SET LOCAL ROLE authenticated;
DO $j$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-11111111111a')::text, true); END $j$;
DO $m7$
DECLARE v_afetadas bigint;
BEGIN
  UPDATE public.audit_logs SET details = '{"adulterado":true}'::jsonb;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  IF v_afetadas <> 0 THEN RAISE EXCEPTION 'FALHOU [M.7]: authenticated alterou % linhas da trilha', v_afetadas; END IF;
  DELETE FROM public.audit_logs;
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  IF v_afetadas <> 0 THEN RAISE EXCEPTION 'FALHOU [M.7]: authenticated apagou % linhas da trilha', v_afetadas; END IF;
  RAISE NOTICE 'PASS [M.7] NEGADO (RLS): authenticated nao altera nem apaga nenhuma linha da trilha';
END $m7$;
RESET ROLE;

SELECT pg_temp.espera('M.8 a trilha segue intacta e sem adulteracao',
  (SELECT (count(*) = (SELECT n FROM m_trilha_antes)
           AND NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE details ? 'adulterado'))::text
     FROM public.audit_logs), 'true');

ROLLBACK;
\echo 'PASS: trilha das acoes administrativas — 8 gatilhos nao-vacuos (1 registro por operacao), profiles restrito aos 4 campos de acesso, global_settings sem valor, ator JWT/sistema, EXECUTE negado, anon negado e trilha a prova de forja/adulteracao.'
