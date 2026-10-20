#!/usr/bin/env bash
# Cartao agendadores Edge + purga do log do cron (py-102).
#
# Contrato A/B/C em PostgreSQL descartavel (docker), no mesmo formato dos testes
# irmaos scripts/db-audit/cron-secret-l5-contract.test.sh (helpers, stub de cron/vault,
# ESCUDO de DML direto em cron.job) e retry-disposable-postgres-test.sh (bootstrap).
#
# Defeito que o contrato prova (BLOCO A):
#   * tres edges prometidas pela interface (auto-close-conversations,
#     send-scheduled-report, cleanup-rate-limit-logs) nao tinham job no pg_cron;
#   * cron.job_run_details nunca era expurgado.
# E prova que a emenda NAO tem efeito colateral:
#   A1 os seis jobs nascem com a cadencia esperada, do dono atual;
#   A2 reaplicar nao duplica (IF cron.job -> alter_job), nao volta a "criar";
#   A3 os jobs de Edge mandam x-cron-secret lido do Vault, sem Bearer/anon key, timeout > 0;
#   A4 nenhum DML direto em cron.job (a 42501 de producao) -- acesso so por leitura;
#   B  claim_due_scheduled_reports: service_role, reivindica SO vencido+ativo, avanca
#      next_send_at (nao duplica no segundo tick) e anon/authenticated nao executam;
#   C  purge_cron_job_run_details: retencao de 7 dias (apaga o antigo, preserva o novo)
#      e o erro sem permissao e explicito, nunca silencioso.
#
# LIMITE DECLARADO: o container NAO tem o Vault nem o pg_cron do Supabase. O pre.sql
# cria STUBS fieis (cron.job com o ESCUDO do 42501 + cron.job_run_details, Vault,
# auth.role(), as tabelas/guards de cleanup_crm_sync_outbox e ai_rate_limit_purge).
# O que se prova e o que a MIGRATION faz sobre essa superficie, nao o pg_cron real.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -n "${MIGRATIONS_DIR:-}" ]]; then
  migrations_dir="$MIGRATIONS_DIR"
elif [[ -d "$repo_root/supabase/migrations" ]]; then
  migrations_dir="$repo_root/supabase/migrations"
else
  migrations_dir="${ZAPP_REPO_ROOT:-$HOME/projetos/Zapp_Web_V2}/supabase/migrations"
fi
migration="$migrations_dir/20261013093000_agendadores_edge_e_purga_cron.sql"
postgres_image="${AGENDADORES_CRON_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-agendadores-cron-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-agendadores-cron-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_db() {
  local db="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" -c "$sql"
}
psql_sql() { psql_db postgres "$1"; }
psql_file_db() {
  local db="$1" file="$2"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$db" < "$file"
}
psql_file() { psql_file_db postgres "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

normaliza_sql() { sed -E 's/--.*$//' "$1" | tr '\n' ' ' | tr -s ' '; }

# Assercao de ARQUIVO: o acesso a cron.job tem de ser LEITURA (o DML direto e o 42501 medido
# em producao em 20260930430000). Escrita so por cron.schedule/alter_job/unschedule.
checa_sem_dml_direto() {
  local arquivo="$1" norm precedentes
  norm="$(normaliza_sql "$arquivo")"
  if grep -qiE 'DELETE[[:space:]]+FROM[[:space:]]+cron\.job([^_A-Za-z0-9]|$)' <<< "$norm"; then
    printf 'a migration faz DELETE direto em cron.job (42501 em producao)'; return 1
  fi
  if grep -qiE '(UPDATE|INSERT[[:space:]]+INTO|TRUNCATE)[[:space:]]*cron\.job([^_A-Za-z0-9]|$)' <<< "$norm"; then
    printf 'a migration faz UPDATE/INSERT/TRUNCATE direto em cron.job (42501 em producao)'; return 1
  fi
  for f in 'PERFORM[[:space:]]+cron\.schedule\(' 'PERFORM[[:space:]]+cron\.alter_job\('; do
    grep -qiE "$f" <<< "$norm" || { printf 'a migration deveria agendar por %s' "$f"; return 1; }
  done
  # Todo acesso a cron.job tem de ser LEITURA: a UNICA palavra que pode preceder a tabela e
  # FROM (o stub PROVA o 42501 de escrita com o escudo do pre.sql).
  precedentes="$( { grep -oiE '[A-Za-z_]+[[:space:]]+cron\.job\b' <<< "$norm" || true; } | tr -s ' ' | tr 'A-Z' 'a-z' | sort -u | tr '\n' '|')"
  if [[ "$precedentes" != 'from cron.job|' ]]; then
    printf 'a migration acessa cron.job por algo que nao e leitura (precedentes: %s)' "$precedentes"; return 1
  fi
  return 0
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

mkdir -p "${TMPDIR:-/tmp}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
-- ── roles do PostgREST ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

-- ── auth.role() (stub fiel: le a claim que o PostgREST publica na sessao) ──────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;

-- ── default ACL do Supabase: funcao NOVA em public ja nasce com EXECUTE para os roles
--    do PostgREST. Sem isso os REVOKE da migration nao teriam o que provar.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ── Vault (stub) ───────────────────────────────────────────────────────────────
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
INSERT INTO vault.secrets (name, secret) VALUES ('zapp_project_url', 'https://projeto-exemplo.invalid')
  ON CONFLICT (name) DO NOTHING;

-- ── pg_cron (stub FIEL ao 1.6) ─────────────────────────────────────────────────
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
CREATE TABLE IF NOT EXISTS cron.job_run_details (
  runid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobid bigint,
  status text,
  start_time timestamptz,
  end_time timestamptz
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

-- ── superficie minima que a migration toca ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_type text NOT NULL DEFAULT 'dashboard_summary',
  frequency text NOT NULL DEFAULT 'weekly',
  recipients text[] NOT NULL DEFAULT '{}',
  format text NOT NULL DEFAULT 'pdf',
  is_active boolean DEFAULT true,
  next_send_at timestamptz,
  last_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.crm_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'succeeded',
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- stubs das funcoes de manutencao EXISTENTES (mesmo nome/assinatura/guarda das reais)
CREATE OR REPLACE FUNCTION public.cleanup_crm_sync_outbox(
  p_succeeded_days integer DEFAULT 90, p_dead_letter_days integer DEFAULT 180, p_limit integer DEFAULT 1000)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.crm_sync_outbox WHERE status = 'succeeded' AND completed_at < now() - make_interval(days => p_succeeded_days);
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.cleanup_crm_sync_outbox(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_crm_sync_outbox(integer, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.ai_rate_limit_purge(p_older_than timestamptz)
  RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    WITH removed AS (DELETE FROM public.edge_rate_limits WHERE updated_at < p_older_than RETURNING 1)
    SELECT COALESCE(count(*), 0)::integer FROM removed;
$$;
REVOKE ALL ON FUNCTION public.ai_rate_limit_purge(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rate_limit_purge(timestamptz) TO service_role;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

# ── BLOCO A: os seis agendadores nascem, e reaplicar nao duplica ────────────────
printf '[INFO] BLOCO A: agendadores\n'
apply_out="$(psql_file "$migration" | tail -n1)"
[[ "$apply_out" == *'"criados"'* ]] || fail "apply nao devolveu o resumo: $apply_out"

expect_value 'A1a. auto-close-conversations com cadencia de 10 min' \
  'auto-close-conversations|4-59/10 * * * *' \
  "SELECT jobname || '|' || schedule FROM cron.job WHERE jobname = 'auto-close-conversations'"
expect_value 'A1b. send-scheduled-report com cadencia de 15 min' \
  'send-scheduled-report|9-59/15 * * * *' \
  "SELECT jobname || '|' || schedule FROM cron.job WHERE jobname = 'send-scheduled-report'"
expect_value 'A1c. purge-cron-job-run-details diario' \
  'purge-cron-job-run-details|29 3 * * *' \
  "SELECT jobname || '|' || schedule FROM cron.job WHERE jobname = 'purge-cron-job-run-details'"
expect_value 'A1d. exatamente 6 jobs novos, do dono atual' '6' \
  "SELECT count(*) FROM cron.job WHERE username = current_user AND jobname IN
   ('auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs',
    'purge-crm-sync-outbox','purge-ai-rate-limits','purge-cron-job-run-details')"
expect_value 'A1e. nenhum DML direto em cron.job: nenhum job ficou sem dono' '0' \
  "SELECT count(*) FROM cron.job WHERE username IS NULL"

# A2: reaplicar nao duplica.
reapply_out="$(psql_file "$migration" | tail -n1)"
[[ "$reapply_out" == *'"criados": []'* ]] || fail "reaplicar deveria alterar, nao criar: $reapply_out"
expect_value 'A2. reaplicar nao duplica job' '6' \
  "SELECT count(*) FROM cron.job WHERE jobname LIKE ANY (ARRAY['auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs','purge-crm-sync-outbox','purge-ai-rate-limits','purge-cron-job-run-details'])"

expect_value 'A3a. job de Edge manda x-cron-secret do Vault (gmail_cron_secret)' '1' \
  "SELECT count(*) FROM cron.job WHERE jobname = 'auto-close-conversations'
     AND command LIKE '%x-cron-secret%' AND command LIKE '%gmail_cron_secret%'"
expect_value 'A3b. nenhum job novo manda Bearer/anon key' '0' \
  "SELECT count(*) FROM cron.job WHERE jobname IN ('auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs')
     AND (command LIKE '%Bearer%' OR command LIKE '%apikey%')"
expect_value 'A3c. todo job de Edge tem timeout > 0' '3' \
  "SELECT count(*) FROM cron.job WHERE jobname IN ('auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs')
     AND command ~ 'timeout_milliseconds := [1-9]'"

expect_value 'A3d. a URL base nao fica literal no comando (vem de public.zapp_project_url())' '0' \
  "SELECT count(*) FROM cron.job WHERE jobname IN ('auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs') AND command LIKE '%://%'"
expect_value 'A3e. public.zapp_project_url() resolve do Vault quando o GUC nao existe' 'https://projeto-exemplo.invalid' \
  "SELECT public.zapp_project_url()"
checa_sem_dml_direto "$migration" || fail "A4. $?"
printf '[PASS] A4. a migration nao faz DML direto em cron.job (so leitura + schedule/alter_job)\n'

# ── BLOCO B: claim dos relatorios vencidos ─────────────────────────────────────
printf '[INFO] BLOCO B: claim_due_scheduled_reports\n'
psql_sql "INSERT INTO public.scheduled_reports (name, frequency, is_active, next_send_at) VALUES
  ('vencido-diario', 'daily',   true,  now() - interval '1 hour'),
  ('vencido-semanal','weekly',  true,  now() - interval '1 day'),
  ('futuro',         'daily',   true,  now() + interval '1 day'),
  ('inativo-vencido','daily',   false, now() - interval '1 day'),
  ('sem-cadencia',   'daily',   true,  NULL);
CREATE TABLE _due AS SELECT name, next_send_at FROM public.scheduled_reports
  WHERE coalesce(is_active, true) AND next_send_at IS NOT NULL AND next_send_at <= now();" >/dev/null

expect_error 'B1. sem service_role a RPC recusa' 'service_role_required' \
  "SELECT * FROM public.claim_due_scheduled_reports(25)"

expect_value 'B2. reivindica SO os vencidos e ativos' '2' \
  "SELECT count(*) FROM (SELECT set_config('request.jwt.claim.role','service_role',true)) s,
     LATERAL public.claim_due_scheduled_reports(25) c"
expect_value 'B2b. nao reivindica inativo nem futuro' '0' \
  "SELECT count(*) FROM (SELECT set_config('request.jwt.claim.role','service_role',true)) s,
     LATERAL public.claim_due_scheduled_reports(25) c WHERE c.name IN ('inativo-vencido','futuro','sem-cadencia')"
expect_value 'B3. segundo tick nao devolve o mesmo relatorio (nao duplica)' '0' \
  "SELECT count(*) FROM (SELECT set_config('request.jwt.claim.role','service_role',true)) s,
     LATERAL public.claim_due_scheduled_reports(25) c"
expect_value 'B3b. next_send_at avancou exatamente pela cadencia (daily +1d, weekly +7d)' \
  'daily|true|weekly|true' \
  "SELECT string_agg(r.frequency || '|' ||
       (r.next_send_at = d.next_send_at + CASE r.frequency
          WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' ELSE interval '7 days' END)::text,
       '|' ORDER BY r.frequency)
     FROM _due d JOIN public.scheduled_reports r USING (name)
     WHERE r.name IN ('vencido-diario','vencido-semanal')"
expect_value 'B4a. anon nao executa a RPC' 'f' \
  "SELECT has_function_privilege('anon','public.claim_due_scheduled_reports(integer)','EXECUTE')"
expect_value 'B4b. authenticated nao executa a RPC' 'f' \
  "SELECT has_function_privilege('authenticated','public.claim_due_scheduled_reports(integer)','EXECUTE')"
expect_value 'B4c. service_role executa a RPC' 't' \
  "SELECT has_function_privilege('service_role','public.claim_due_scheduled_reports(integer)','EXECUTE')"

# ── BLOCO C: purga do log do cron ──────────────────────────────────────────────
printf '[INFO] BLOCO C: purge_cron_job_run_details\n'
psql_sql "INSERT INTO cron.job_run_details (jobid, status, start_time, end_time) VALUES
  (1, 'succeeded', now() - interval '40 days', now() - interval '40 days'),
  (1, 'succeeded', now() - interval '8 days',  now() - interval '8 days'),
  (1, 'succeeded', now() - interval '2 days',  now() - interval '2 days');" >/dev/null

expect_value 'C1. purga(7) remove so o que passou de 7 dias' '2' \
  "SELECT public.purge_cron_job_run_details(7)"
expect_value 'C1b. o log recente (2 dias) fica' '1' \
  "SELECT count(*) FROM cron.job_run_details"
expect_value 'C2. retencao fica presa no piso de 1 dia (0 -> 1 dia apaga o de 2 dias)' '1' \
  "SELECT public.purge_cron_job_run_details(0)"
expect_value 'C2b. sem permissao o erro e explicito, nunca silencioso' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname = 'purge_cron_job_run_details'
     AND prosrc LIKE '%cron_job_run_details_sem_permissao%'"
expect_value 'C3. anon nao executa as funcoes de manutencao' 'f' \
  "SELECT has_function_privilege('anon','public.zapp_purge_crm_sync_outbox(integer,integer,integer)','EXECUTE')"

printf '\n[INFO] BLOCO D: a linha -- Rollback: do arquivo e executavel\n'
mkdir -p .tmp
awk '/Rollback \(SQL execut.{1,2}vel, na ordem\)/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' "$migration" > .tmp/rollback.sql
[[ -s .tmp/rollback.sql ]] || fail 'D0. a secao de rollback do arquivo esta vazia'
psql_file .tmp/rollback.sql >/dev/null
expect_value 'D1. o rollback desagenda os 6 jobs' '0' \
  "SELECT count(*) FROM cron.job WHERE jobname IN ('auto-close-conversations','send-scheduled-report','cleanup-rate-limit-logs','purge-crm-sync-outbox','purge-ai-rate-limits','purge-cron-job-run-details')"
expect_value 'D2. o rollback remove a RPC de reivindicacao' 'true' \
  "SELECT (to_regprocedure('public.claim_due_scheduled_reports(integer)') IS NULL)::text"
expect_value 'D3. o rollback remove o indice de vencimento' 'true' \
  "SELECT (to_regclass('public.scheduled_reports_due_idx') IS NULL)::text"
expect_value 'D4. o rollback remove as funcoes que a migration criou' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname IN ('next_report_send_at','zapp_project_url','zapp_purge_crm_sync_outbox','zapp_purge_ai_rate_limits','purge_cron_job_run_details','apply_zapp_agendadores_e_purga_cron')"

printf '\n[OK] contrato dos agendadores Edge + purga do log do cron: TODAS as assercoes passaram.\n'
