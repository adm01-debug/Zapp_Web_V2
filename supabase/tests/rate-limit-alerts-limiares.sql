-- rate-limit-alerts-limiares — pico de bloqueios do rate limit no War Room.
-- (cartao rate-limit-alerts-limiares-disparo; migration
-- 20261012184049_rate_limit_alerts_cron_limiar.sql).
--
-- O QUE PROVA. Com a MIGRATION REAL aplicada, que o pico de requisicoes
-- bloqueadas agora alerta — uma vez por janela:
--   R1-R2 (VERMELHO, com -v sem_migration=1): sem a migration o avaliador nem
--     existe (42883) e 60 bloqueios na janela nao geram NENHUM alerta;
--   G1-G5: limiar atingido -> exatamente 1 warroom_alerts com
--     source = 'rate_limit', alert_type pela escala (>= 3x critical), nao lido,
--     dedupe_key de janela, mensagem agregada (sem IP/telefone);
--   G6: 2a chamada na MESMA janela -> 0 inseridos, total continua 1
--     (dedupe_key + ON CONFLICT, sem corrida);
--   G7: abaixo do limiar e fora da janela -> 0;
--   G8-G9: min_severity segura o pico de 2x; pico de 3x alerta como critical;
--   G10: is_active = false -> 0 e nada gravado;
--   G11: entrada invalida (limiar 0, severidade fora do dominio) cai no CHECK;
--   G12-G13: RLS/ACL com o PAPEL REAL (admin le/edita, agente nao le nem edita,
--     anon barrado, EXECUTE do avaliador fechado);
--   G14: job do cron agendado e reaplicacao idempotente;
--   G15: o -- Rollback: da migration executa e a reaplicacao restaura tudo.
--
-- COMO RODA. Em Postgres descartavel; fixtures e assercoes numa transacao que
-- termina em ROLLBACK — zero efeito colateral e idempotente:
--   VERDE:
--   docker run --rm -d --name zapp-v2-rlalert-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=*** postgres:17-alpine
--   docker exec -i zapp-v2-rlalert-$$ psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/supabase/migrations/20261012184049_rate_limit_alerts_cron_limiar.sql \
--     < supabase/tests/rate-limit-alerts-limiares.sql
--   VERMELHO esperado (o mesmo comando com -v sem_migration=1 falha em R1/R2
--   com a mensagem 'RED OK', provando que sem a migration nada alerta).
-- O arquivo cria roles, schema auth e as tabelas de origem A MAO: so roda em
-- Postgres descartavel. Papel de usuario sempre por SET LOCAL ROLE dentro de
-- DO $$ ... $$, nunca superusuario/dono.
--
-- VERMELHO esperado sem a migration: o mesmo comando com -v sem_migration=1
-- falha em R1/R2 com a mensagem 'RED OK' (o avaliador nao existe e nenhum
-- alerta e gerado). Com a migration, TODAS as assercoes passam.

\set ON_ERROR_STOP on

-- Caminho do arquivo da migration sob teste: -v mig=<caminho> vence o padrão.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261012184049_rate_limit_alerts_cron_limiar.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão (forma ANTERIOR à migration: sem tabela de
-- limiares nem avaliador; helpers com o mesmo corpo das migrations de origem)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user) $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'viewer');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  role public.app_role NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);

-- Helpers reais (mesmo corpo das migrations de origem).
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::app_role) $$;

CREATE FUNCTION public.secd_caller_ok(p_subject_user_id uuid, p_admin_only boolean) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
           WHEN auth.uid() IS NULL THEN true
           WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','supervisor')) THEN true
           WHEN p_admin_only THEN false
           WHEN p_subject_user_id IS NULL THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.user_id = auth.uid())
           ELSE p_subject_user_id = auth.uid()
         END $$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- rate_limit_logs (mesmas colunas da 20251231115910).
CREATE TABLE public.rate_limit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  user_id uuid,
  request_count integer NOT NULL DEFAULT 1,
  blocked boolean DEFAULT false,
  user_agent text,
  country text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- warroom_alerts (mesmas colunas da 20260317212204 + dedupe_key da 20261006155408).
CREATE TABLE public.warroom_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  message text NOT NULL,
  source text,
  is_read boolean DEFAULT false,
  dismissed_by uuid,
  created_at timestamptz DEFAULT now(),
  dedupe_key text
);
CREATE UNIQUE INDEX ux_warroom_alerts_dedupe_key ON public.warroom_alerts (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- pg_cron (stub minimo: cron.job + schedule/unschedule, o suficiente para a 3a parte).
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true,
  username text NOT NULL DEFAULT current_user
);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
  LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command, username)
  VALUES (job_name, schedule, command, current_user) RETURNING jobid INTO v;
  RETURN v;
END $$;
CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  DELETE FROM cron.job WHERE jobid = job_id AND username = current_user RETURNING true INTO v;
  RETURN COALESCE(v, false);
END $$;

-- ---------------------------------------------------------------------------
-- Massa: 60 bloqueios recentes + 40 antigos (fora da janela de 5 min)
-- ---------------------------------------------------------------------------
INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked)
SELECT '10.0.0.' || (n % 250), '/rest/v1/contacts', true FROM generate_series(1, 60) n;
INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked, created_at)
SELECT '10.0.1.' || n, '/rest/v1/orders', true, now() - interval '30 minutes' FROM generate_series(1, 40) n;

-- ---------------------------------------------------------------------------
-- VERMELHO (sem a migration): o avaliador nem existe e nada alerta
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
DO $$
BEGIN
  BEGIN
    PERFORM public.evaluate_rate_limit_alerts();
    RAISE EXCEPTION 'RED FALHOU: o avaliador existia sem a migration';
  EXCEPTION WHEN undefined_function THEN
    IF SQLSTATE <> '42883' THEN
      RAISE EXCEPTION 'RED FALHOU: SQLSTATE % inesperado (% / %)', SQLSTATE, SQLERRM, SQLSTATE;
    END IF;
  END;
  IF (SELECT count(*) FROM public.warroom_alerts WHERE source = 'rate_limit') <> 0 THEN
    RAISE EXCEPTION 'RED FALHOU: havia alerta de rate limit sem a migration';
  END IF;
  RAISE EXCEPTION 'RED OK: sem a migration o avaliador nao existe (42883) e 60 bloqueios nao geram alerta';
END $$;
\endif

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório)
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- G1-G5 — limiar atingido: exatamente 1 alerta, critical, agregado
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ret integer;
BEGIN
  v_ret := public.evaluate_rate_limit_alerts();
  IF v_ret <> 1 THEN
    RAISE EXCEPTION 'G1 FALHOU: o pico (60 bloqueios) retornou %, esperado 1', v_ret;
  END IF;
  IF (SELECT count(*) FROM public.warroom_alerts WHERE source = 'rate_limit') <> 1 THEN
    RAISE EXCEPTION 'G2 FALHOU: total de alertas de rate limit <> 1';
  END IF;
  IF (SELECT source || '|' || alert_type FROM public.warroom_alerts WHERE source = 'rate_limit')
     <> 'rate_limit|critical' THEN
    RAISE EXCEPTION 'G3 FALHOU: esperado source rate_limit + critical (>= 3x o limiar de 20)';
  END IF;
  IF NOT (SELECT (is_read IS NOT true) AND (dedupe_key LIKE 'rate-limit:v1:%')
          FROM public.warroom_alerts WHERE source = 'rate_limit') THEN
    RAISE EXCEPTION 'G4 FALHOU: alerta lido ou sem dedupe_key de janela';
  END IF;
  IF (SELECT count(*) FROM public.warroom_alerts WHERE source = 'rate_limit'
      AND (message ~ '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' OR message ~ '\+?[0-9]{10,}')) <> 0 THEN
    RAISE EXCEPTION 'G5 FALHOU: a mensagem carrega IP ou telefone (nao e agregada)';
  END IF;
  RAISE NOTICE 'G1-G5 OK: pico gera 1 alerta critical, nao lido, com dedupe_key e mensagem agregada';
END $$;

-- ---------------------------------------------------------------------------
-- G6 — 2a rodada na mesma janela nao repete (ON CONFLICT)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ret integer;
BEGIN
  v_ret := public.evaluate_rate_limit_alerts();
  IF v_ret <> 0 THEN
    RAISE EXCEPTION 'G6 FALHOU: 2a rodada na mesma janela inseriu % (esperado 0)', v_ret;
  END IF;
  IF (SELECT count(*) FROM public.warroom_alerts WHERE source = 'rate_limit') <> 1 THEN
    RAISE EXCEPTION 'G6 FALHOU: total de alertas <> 1 apos a 2a rodada';
  END IF;
  RAISE NOTICE 'G6 OK: mesma janela nao duplica (0 inseridos, total 1)';
END $$;

-- ---------------------------------------------------------------------------
-- G7 — sem bloqueios na janela: nada
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ret integer;
BEGIN
  UPDATE public.rate_limit_logs SET created_at = now() - interval '2 hours';
  v_ret := public.evaluate_rate_limit_alerts();
  IF v_ret <> 0 THEN
    RAISE EXCEPTION 'G7 FALHOU: sem bloqueios na janela retornou % (esperado 0)', v_ret;
  END IF;
  RAISE NOTICE 'G7 OK: fora da janela, 0 alerta';
END $$;

-- ---------------------------------------------------------------------------
-- G8-G9 — gravidade pelo multiplo + min_severity
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ret integer;
BEGIN
  DELETE FROM public.warroom_alerts WHERE source = 'rate_limit';
  UPDATE public.rate_limit_alert_settings SET blocked_threshold = 10, min_severity = 'critical';
  INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked)
  SELECT '10.0.2.' || (n % 250), '/rest/v1/deals', true FROM generate_series(1, 25) n;
  v_ret := public.evaluate_rate_limit_alerts();
  IF v_ret <> 0 THEN
    RAISE EXCEPTION 'G8 FALHOU: pico de 2x com min_severity critical alertou (%)', v_ret;
  END IF;
  IF (SELECT count(*) FROM public.warroom_alerts WHERE source = 'rate_limit') <> 0 THEN
    RAISE EXCEPTION 'G8 FALHOU: caso 2x gravou alerta';
  END IF;
  INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked)
  SELECT '10.0.3.' || (n % 250), '/rest/v1/deals', true FROM generate_series(1, 10) n;
  v_ret := public.evaluate_rate_limit_alerts();
  IF v_ret <> 1 THEN
    RAISE EXCEPTION 'G9 FALHOU: pico de 3x retornou % (esperado 1)', v_ret;
  END IF;
  IF (SELECT alert_type FROM public.warroom_alerts WHERE source = 'rate_limit'
      ORDER BY created_at DESC LIMIT 1) <> 'critical' THEN
    RAISE EXCEPTION 'G9 FALHOU: o segundo alerta nao e critical';
  END IF;
  RAISE NOTICE 'G8-G9 OK: 2x segurado por min_severity, 3x alerta critical';
END $$;

-- ---------------------------------------------------------------------------
-- G10 — is_active = false: nada
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ret integer;
BEGIN
  DELETE FROM public.warroom_alerts WHERE source = 'rate_limit';
  UPDATE public.rate_limit_alert_settings SET is_active = false, min_severity = 'info';
  INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked)
  SELECT '10.0.4.' || (n % 250), '/rest/v1/deals', true FROM generate_series(1, 50) n;
  v_ret := public.evaluate_rate_limit_alerts();
  IF v_ret <> 0 THEN
    RAISE EXCEPTION 'G10 FALHOU: desligado retornou % (esperado 0)', v_ret;
  END IF;
  IF (SELECT count(*) FROM public.warroom_alerts WHERE source = 'rate_limit') <> 0 THEN
    RAISE EXCEPTION 'G10 FALHOU: desligado gravou alerta';
  END IF;
  UPDATE public.rate_limit_alert_settings SET is_active = true;
  RAISE NOTICE 'G10 OK: is_active = false gera 0 alerta e nada grava';
END $$;

-- ---------------------------------------------------------------------------
-- G11 — entrada invalida barrada pelo CHECK
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.rate_limit_alert_settings SET blocked_threshold = 0;
    RAISE EXCEPTION 'G11 FALHOU: limiar 0 passou pelo CHECK';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%rate_limit_alert_settings_threshold_check%' THEN
      RAISE EXCEPTION 'G11 FALHOU: CHECK inesperado (%)', SQLERRM;
    END IF;
  END;
  BEGIN
    UPDATE public.rate_limit_alert_settings SET min_severity = 'urgente';
    RAISE EXCEPTION 'G11 FALHOU: severidade invalida passou pelo CHECK';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%rate_limit_alert_settings_severity_check%' THEN
      RAISE EXCEPTION 'G11 FALHOU: CHECK inesperado (%)', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'G11 OK: limiar 0 e severidade invalida barrados pelo CHECK';
END $$;

-- ---------------------------------------------------------------------------
-- G12-G13 — RLS/ACL com o PAPEL REAL (admin le/edita, agente nao, anon nao)
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
VALUES ('a0000000-0000-0000-0000-000000000001', 'admin');
INSERT INTO public.profiles (user_id, role)
VALUES ('b0000000-0000-0000-0000-000000000002', 'agent');

DO $$
BEGIN
  IF (SELECT relrowsecurity::text FROM pg_class
      WHERE oid = 'public.rate_limit_alert_settings'::regclass) <> 'true' THEN
    RAISE EXCEPTION 'G12 FALHOU: RLS nao habilitada na tabela de limiares';
  END IF;
  IF has_table_privilege('anon', 'public.rate_limit_alert_settings', 'SELECT') THEN
    RAISE EXCEPTION 'G12 FALHOU: anon tem SELECT na tabela de limiares';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.rate_limit_alert_settings', 'SELECT') THEN
    RAISE EXCEPTION 'G12 FALHOU: authenticated sem SELECT na tabela de limiares';
  END IF;
  IF has_function_privilege('anon', 'public.evaluate_rate_limit_alerts()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.evaluate_rate_limit_alerts()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.evaluate_rate_limit_alerts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'G12 FALHOU: EXECUTE do avaliador aberto alem do dono';
  END IF;
  RAISE NOTICE 'G12 OK: RLS ligada, anon sem SELECT, EXECUTE do avaliador so do dono';
END $$;

DO $$
DECLARE v_rows integer;
BEGIN
  -- admin le
  PERFORM set_config('request.jwt.claims',
    '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.rate_limit_alert_settings) <> 1 THEN
    RAISE EXCEPTION 'G13 FALHOU: admin nao le os limiares';
  END IF;
  -- admin edita
  WITH up AS (UPDATE public.rate_limit_alert_settings SET blocked_threshold = 10 RETURNING 1)
  SELECT count(*) INTO v_rows FROM up;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'G13 FALHOU: admin nao edita os limiares';
  END IF;
  RESET ROLE;
  -- agente nao le
  PERFORM set_config('request.jwt.claims',
    '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.rate_limit_alert_settings) <> 0 THEN
    RAISE EXCEPTION 'G13 FALHOU: agente le os limiares';
  END IF;
  -- agente nao edita
  WITH up AS (UPDATE public.rate_limit_alert_settings SET blocked_threshold = 999 RETURNING 1)
  SELECT count(*) INTO v_rows FROM up;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'G13 FALHOU: agente editou os limiares';
  END IF;
  RESET ROLE;
  IF (SELECT blocked_threshold FROM public.rate_limit_alert_settings) <> 10 THEN
    RAISE EXCEPTION 'G13 FALHOU: a tentativa do agente mudou o valor guardado';
  END IF;
  -- authenticated nao executa o avaliador
  PERFORM set_config('request.jwt.claims',
    '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.evaluate_rate_limit_alerts();
    RAISE EXCEPTION 'G13 FALHOU: authenticated executou o avaliador';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'G13 FALHOU: SQLSTATE % inesperado ao executar (%)', SQLSTATE, SQLERRM;
    END IF;
  END;
  RESET ROLE;
  -- anon e barrado
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM (SELECT count(*) FROM public.rate_limit_alert_settings);
    RAISE EXCEPTION 'G13 FALHOU: anon leu a tabela de limiares';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'G13 FALHOU: SQLSTATE % inesperado para anon', SQLSTATE;
    END IF;
  END;
  RESET ROLE;
  RAISE NOTICE 'G13 OK: admin le/edita, agente nem le nem edita, anon e authenticated barrados no avaliador';
END $$;

-- ---------------------------------------------------------------------------
-- G14 — job do cron agendado e reaplicacao idempotente
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT schedule FROM cron.job WHERE jobname = 'rate-limit-alerts') <> '*/5 * * * *' THEN
    RAISE EXCEPTION 'G14 FALHOU: job rate-limit-alerts fora do schedule */5';
  END IF;
  RAISE NOTICE 'G14 OK: job rate-limit-alerts agendado a cada 5 min';
END $$;

\i :mig

DO $$
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'rate-limit-alerts') <> 1 THEN
    RAISE EXCEPTION 'G14 FALHOU: reaplicar a migration duplicou o job';
  END IF;
  IF (SELECT count(*) FROM public.rate_limit_alert_settings) <> 1 THEN
    RAISE EXCEPTION 'G14 FALHOU: reaplicar duplicou a linha de limiares';
  END IF;
  RAISE NOTICE 'G14 OK: reaplicar nao duplica job nem linha de limiares';
END $$;

-- ---------------------------------------------------------------------------
-- G15 — o -- Rollback: da migration executa (espelho das linhas do bloco
--       "-- Rollback (SQL executável, na ordem):" do arquivo) e a reaplicacao
--       restaura tudo
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rate-limit-alerts';
DROP FUNCTION IF EXISTS public.evaluate_rate_limit_alerts();
DROP TABLE IF EXISTS public.rate_limit_alert_settings;

DO $$
BEGIN
  IF to_regclass('public.rate_limit_alert_settings') IS NOT NULL THEN
    RAISE EXCEPTION 'G15 FALHOU: tabela de limiares sobreviveu ao rollback';
  END IF;
  IF to_regprocedure('public.evaluate_rate_limit_alerts()') IS NOT NULL THEN
    RAISE EXCEPTION 'G15 FALHOU: avaliador sobreviveu ao rollback';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'rate-limit-alerts') <> 0 THEN
    RAISE EXCEPTION 'G15 FALHOU: job sobreviveu ao rollback';
  END IF;
  RAISE NOTICE 'G15 OK: rollback remove tabela, avaliador e job';
END $$;

\i :mig

DO $$
BEGIN
  IF to_regprocedure('public.evaluate_rate_limit_alerts()') IS NULL THEN
    RAISE EXCEPTION 'G15 FALHOU: reaplicar nao restaurou o avaliador';
  END IF;
  RAISE NOTICE 'G15 OK: reaplicar depois do rollback restaura o avaliador';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'rate-limit-alerts-limiares: TODAS as assercoes passaram (R1-R2/G1-G15)';
END $$;

ROLLBACK;
