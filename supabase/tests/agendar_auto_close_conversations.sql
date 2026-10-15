-- PK-02: contrato do job `auto-close-conversations` no pg_cron (nome, cadencia, dono,
-- comando e idempotencia), provado sobre a MIGRATION REAL
-- (supabase/migrations/20261014183000_agendar_auto_close.sql).
--
-- LIMITE DECLARADO: o container nao tem o pg_cron nem o Vault do Supabase. Este arquivo
-- cria STUBS fieis: cron.job com o ESCUDO do 42501 (DML direto impossivel), as funcoes
-- cron.schedule/unschedule/alter_job e o Vault. public.zapp_project_url() e stub porque no
-- banco real ela vem do PE-102 (20261013093000) e a migration so a usa DENTRO do comando
-- do job (o apply nao a executa); o contrato dela e provado pelo teste irmao
-- scripts/db-audit/agendadores-edge-e-purga-cron.test.sh (A3e). O que se prova aqui e o
-- que ESTA migration escreve nessa superficie, nao o pg_cron real.
--
-- Como rodar (PostgreSQL 17 descartavel, a partir da raiz do repo):
--   docker run --rm -d --name zapp-pk02-pg -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   # vermelho (sem aplicar a migration), num banco limpo:
--   docker exec -i zapp-pk02-pg psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/dev/null -f - < supabase/tests/agendar_auto_close_conversations.sql ; echo $?
--   # verde (aplica a migration), num banco limpo:
--   docker exec -i zapp-pk02-pg psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -f - < supabase/tests/agendar_auto_close_conversations.sql ; echo $?
--
-- Sai 0 so quando TODAS as assercoes passam; no primeiro FAIL sai com codigo 3.

\set ON_ERROR_STOP on

-- ─────────────────────────── roles do PostgREST ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

-- Funcao NOVA em public nasce com EXECUTE para os roles do PostgREST (default ACL do
-- Supabase). Sem isso o REVOKE da migration nao teria o que provar (assercao E4).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ─────────────────────────── Vault (stub) ───────────────────────────
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  secret text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, secret AS decrypted_secret, created_at FROM vault.secrets;
INSERT INTO vault.secrets (name, secret) VALUES ('gmail_cron_secret', 'segredo-compartilhado-de-teste')
  ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────── pg_cron (stub fiel ao 1.6) ───────────────────────────
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  active boolean NOT NULL DEFAULT true,
  username text NOT NULL DEFAULT current_user,
  CONSTRAINT cron_job_jobname_username_key UNIQUE (jobname, username)
);
-- ESCUDO: DML direto em cron.job e IMPOSSIVEL pelo caminho canonico (42501 real).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cron_job_escudo_dml_direto' AND tgrelid = 'cron.job'::regclass) THEN
    DROP TRIGGER cron_job_escudo_dml_direto ON cron.job;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION cron.zapp_escudo_dml_direto_cron_job()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'permission denied for table job'
    USING ERRCODE = '42501',
          HINT = 'cron.job pertence a supabase_admin: use cron.schedule/cron.unschedule/cron.alter_job, nunca DML direto.';
END $$;
CREATE TRIGGER cron_job_escudo_dml_direto
  BEFORE INSERT OR UPDATE OR DELETE ON cron.job
  FOR EACH STATEMENT EXECUTE FUNCTION cron.zapp_escudo_dml_direto_cron_job();

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
  RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  INSERT INTO cron.job (jobname, schedule, command, username)
  VALUES (job_name, schedule, command, current_user) RETURNING jobid INTO v;
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
  RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  DELETE FROM cron.job WHERE jobid = job_id AND username = current_user RETURNING true INTO v;
  RETURN COALESCE(v, false);
END $$;
CREATE OR REPLACE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL,
                                          command text DEFAULT NULL, active boolean DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE cron.job AS j
     SET schedule = COALESCE($2, j.schedule), command = COALESCE($3, j.command), active = COALESCE($4, j.active)
   WHERE j.jobid = $1;
END $$;

-- public.zapp_project_url(): no banco real vem do PE-102 (20261013093000). Stub aqui
-- porque a migration so a cita DENTRO do comando do job.
CREATE OR REPLACE FUNCTION public.zapp_project_url()
  RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'https://projeto-exemplo.invalid'::text $$;

-- ─────────────────────────── aplica a migration ───────────────────────────
-- Com -v mig=/dev/null o arquivo roda o modo VERMELHO (nada e aplicado).
\if :{?mig}
\else
\set mig supabase/migrations/20261014183000_agendar_auto_close.sql
\endif
\i :mig

-- ─────────────────────────── E1. nome, cadencia e dono ───────────────────────────
SELECT (count(*) = 1
        AND bool_and(jobname = 'auto-close-conversations')
        AND bool_and(username = current_user)
        AND bool_and(schedule = '4-59/10 * * * *')) AS ok
  FROM cron.job WHERE jobname = 'auto-close-conversations' \gset
\if :ok
\echo 'PASS E1. job auto-close-conversations: exatamente 1, do dono atual, cadencia 4-59/10 * * * *'
\else
\echo 'FAIL E1. job auto-close-conversations ausente, com dono ou cadencia diferentes do contrato'
DO $$ BEGIN RAISE EXCEPTION 'PK-02: assercao falhou (veja o FAIL acima)'; END $$;
\endif

-- ─────────────────────────── E2. comando do job ───────────────────────────
SELECT (count(*) = 1
        AND bool_and(command LIKE '%/functions/v1/auto-close-conversations%')
        AND bool_and(command LIKE '%x-cron-secret%')
        AND bool_and(command LIKE '%gmail_cron_secret%')
        AND bool_and(command NOT LIKE '%Bearer%')
        AND bool_and(command NOT LIKE '%apikey%')
        AND bool_and(command NOT LIKE '%://%')
        AND bool_and(command ~ 'timeout_milliseconds := [1-9]')) AS ok
  FROM cron.job WHERE jobname = 'auto-close-conversations' \gset
\if :ok
\echo 'PASS E2. comando chama a Edge por URL nao literal, com x-cron-secret do Vault, sem Bearer/anon key e com timeout > 0'
\else
\echo 'FAIL E2. comando do job fora do contrato (edge, header do cron, segredo do Vault ou timeout)'
DO $$ BEGIN RAISE EXCEPTION 'PK-02: assercao falhou (veja o FAIL acima)'; END $$;
\endif

-- ─────────────────────────── E3. idempotencia ───────────────────────────
CREATE TEMP TABLE _jobid_antes AS
  SELECT jobid FROM cron.job WHERE jobname = 'auto-close-conversations';
\i :mig
WITH r AS (SELECT public.apply_zapp_agendar_auto_close() AS j)
SELECT (jsonb_array_length(j -> 'criados') = 0
        AND jsonb_array_length(j -> 'alterados') = 1
        AND j -> 'alterados' ->> 0 = 'auto-close-conversations') AS ok
  FROM r \gset
\if :ok
\echo 'PASS E3. reaplicar reajusta o job (criados=0, alterados=1), nunca cria outro'
\else
\echo 'FAIL E3. reaplicar nao segue o caminho IF cron.job -> alter_job'
DO $$ BEGIN RAISE EXCEPTION 'PK-02: assercao falhou (veja o FAIL acima)'; END $$;
\endif

SELECT ((SELECT count(*) FROM cron.job WHERE jobname = 'auto-close-conversations') = 1
        AND (SELECT jobid FROM cron.job WHERE jobname = 'auto-close-conversations')
            = (SELECT jobid FROM _jobid_antes)) AS ok \gset
\if :ok
\echo 'PASS E3b. reaplicar preserva o jobid (reajuste no mesmo job, sem duplicata)'
\else
\echo 'FAIL E3b. reaplicar duplicou o job ou trocou o jobid'
DO $$ BEGIN RAISE EXCEPTION 'PK-02: assercao falhou (veja o FAIL acima)'; END $$;
\endif

-- ─────────────────────────── E4. ACL do agendador ───────────────────────────
SELECT (NOT has_function_privilege('anon', 'public.apply_zapp_agendar_auto_close()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.apply_zapp_agendar_auto_close()', 'EXECUTE')
        AND NOT has_function_privilege('service_role', 'public.apply_zapp_agendar_auto_close()', 'EXECUTE')) AS ok \gset
\if :ok
\echo 'PASS E4. o agendador nao e executavel por anon/authenticated/service_role'
\else
\echo 'FAIL E4. anon/authenticated/service_role ainda executam public.apply_zapp_agendar_auto_close()'
DO $$ BEGIN RAISE EXCEPTION 'PK-02: assercao falhou (veja o FAIL acima)'; END $$;
\endif

\echo 'OK: contrato do job auto-close-conversations (PK-02): TODAS as assercoes passaram.'
