#!/usr/bin/env bash
# Harness descartavel (Docker postgres:17-alpine) — pico de bloqueios do rate limit no War Room.
#
# Prova, em PostgreSQL 17, com a MIGRATION REAL aplicada por marcador interno, que o pico de
# requisicoes bloqueadas nao alertava ninguem e que agora alerta — uma vez por janela.
#
#   RED (estado vivo, sem a migration): nao existe avaliador nem tabela de limiares; 60
#     requisicoes bloqueadas nos ultimos 5 min nao geram NENHUM alerta em warroom_alerts
#     (e public.evaluate_rate_limit_alerts() nem existe -> 42883).
#   GREEN (com a migration):
#     - limiar atingido -> exatamente 1 warroom_alerts com source = 'rate_limit' (com o resto
#       do lote intacto, sem depender de gatilho nenhum);
#     - 2a chamada na MESMA janela -> 0 inseridos, total continua 1 (dedupe_key + ON CONFLICT);
#     - abaixo do limiar e fora da janela -> 0;
#     - is_active = false -> 0; min_severity = 'critical' segura o pico de 2x;
#     - gravidade escala pelo multiplo do limiar (>= 3x critical, >= 2x warning, >= 1x info).
#
# Roda como o PAPEL REAL: admin le/edita via `set role authenticated` + request.jwt.claims;
# anon e negado; a funcao so roda pelo dono (cron). Nao usa o banco real; Postgres descartavel.
#
# Os helpers de dominio (is_admin, secd_caller_ok, update_updated_at_column), as tabelas de
# origem (rate_limit_logs, warroom_alerts) e o pg_cron sao a FIXTURE MINIMA fiel: um Postgres
# cru nao reproduz as centenas de migrations anteriores. A migration sob teste e aplicada real.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

find_migration() {
  grep -rlF "$1" "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true
}
migration="$(find_migration 'rate_limit_alerts_cron_limiar')"
[[ -n "$migration" && -f "$migration" ]] || { printf '[FALHA] migration nao encontrada (marcador rate_limit_alerts_cron_limiar)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="rate-limit-alert-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^rate-limit-alert-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_val()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
psql_raw()  { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
as_user() {
  local claims="$1" sql="$2"
  docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c \
    "set role authenticated; select set_config('request.jwt.claims', '$claims', false); $sql" 2>&1 || true
}
as_anon() {
  local sql="$1"
  docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c \
    "set role anon; $sql" 2>&1 || true
}

assert_equal() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${RATE_LIMIT_ALERT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=rate_limit_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  if docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── fixture minima fiel ──────────────────────────────────────────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user) $$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

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
SQL
pass 'fixture minima montada (auth, roles, is_admin, secd_caller_ok, rate_limit_logs, warroom_alerts, pg_cron)'

alerts_total="SELECT count(*) FROM public.warroom_alerts WHERE source = 'rate_limit'"

# ═══════════════════════════════════════════════════════════════════════════
# RED — estado vivo: pico de bloqueios nao alerta ninguem
# ═══════════════════════════════════════════════════════════════════════════
psql_val "INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked) SELECT '10.0.0.' || (n % 250), '/rest/v1/contacts', true FROM generate_series(1, 60) n" >/dev/null
psql_val "INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked, created_at) SELECT '10.0.1.' || n, '/rest/v1/orders', true, now() - interval '30 minutes' FROM generate_series(1, 40) n" >/dev/null
red="$(psql_raw "SELECT public.evaluate_rate_limit_alerts()")"
assert_has 'RED: o avaliador nem existe no estado vivo (42883)' 'does not exist' "$red"
assert_equal 'RED: 60 bloqueios na janela nao geraram nenhum alerta de rate limit' '0' "$(psql_val "$alerts_total")"

# ═══════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration real
# ═══════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration do fix nao aplicou (GREEN)'
pass "migration aplicada ($(basename "$migration"))"

first="$(psql_raw "SELECT public.evaluate_rate_limit_alerts()")"
assert_equal 'GREEN: o pico (60 bloqueios na janela, fora os 40 antigos) gera 1 alerta' '1' "$first"
assert_equal 'GREEN: total de alertas de rate limit = 1' '1' "$(psql_val "$alerts_total")"
assert_equal 'GREEN: o alerta tem source rate_limit e alert_type critical (>= 3x o limiar de 20)' \
  'rate_limit|critical' "$(psql_val "SELECT source || '|' || alert_type FROM public.warroom_alerts WHERE source='rate_limit'")"
assert_equal 'GREEN: o alerta nao esta lido e tem dedupe_key de janela' 'true|true' \
  "$(psql_val "SELECT (is_read is not true)::text || '|' || (dedupe_key like 'rate-limit:v1:%')::text FROM public.warroom_alerts WHERE source='rate_limit'")"
assert_equal 'GREEN: a mensagem nao carrega IP nem telefone (agregado)' '0' \
  "$(psql_val "SELECT count(*) FROM public.warroom_alerts WHERE source='rate_limit' AND (message ~ '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' OR message ~ '\+?[0-9]{10,}')")"

# ── 2a rodada na mesma janela: nao repete ────────────────────────────────────
second="$(psql_raw "SELECT public.evaluate_rate_limit_alerts()")"
assert_equal 'GREEN: 2a rodada na mesma janela nao insere (ON CONFLICT)' '0' "$second"
assert_equal 'GREEN: continua 1 alerta (sem duplicar)' '1' "$(psql_val "$alerts_total")"

# ── abaixo do limiar: nada ───────────────────────────────────────────────────
psql_val "UPDATE public.rate_limit_logs SET created_at = now() - interval '2 hours'" >/dev/null
assert_equal 'GREEN: sem bloqueios na janela, 0 alerta' '0' "$(psql_raw "SELECT public.evaluate_rate_limit_alerts()")"

# ── gravidade pelo multiplo + min_severity ───────────────────────────────────
# Zera os alertas ja emitidos para que cada caso abaixo falhe por conta propria
# (nao pelo dedupe da mesma janela).
psql_val "DELETE FROM public.warroom_alerts WHERE source = 'rate_limit'" >/dev/null
psql_val "UPDATE public.rate_limit_alert_settings SET blocked_threshold = 10, min_severity = 'critical'" >/dev/null
psql_val "INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked) SELECT '10.0.2.' || (n % 250), '/rest/v1/deals', true FROM generate_series(1, 25) n" >/dev/null
assert_equal 'GREEN: pico de 2x o limiar nao alerta quando min_severity = critical' '0' \
  "$(psql_raw "SELECT public.evaluate_rate_limit_alerts()")"
assert_equal 'GREEN: nada foi gravado no caso 2x' '0' "$(psql_val "$alerts_total")"
psql_val "INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked) SELECT '10.0.3.' || (n % 250), '/rest/v1/deals', true FROM generate_series(1, 10) n" >/dev/null
assert_equal 'GREEN: pico de 3x o limiar alerta como critical' '1' \
  "$(psql_raw "SELECT public.evaluate_rate_limit_alerts()")"
assert_equal 'GREEN: o segundo alerta e critical' 'critical' \
  "$(psql_val "SELECT alert_type FROM public.warroom_alerts WHERE source='rate_limit' ORDER BY created_at DESC LIMIT 1")"

# ── is_active = false: nada ──────────────────────────────────────────────────
psql_val "DELETE FROM public.warroom_alerts WHERE source = 'rate_limit'" >/dev/null
psql_val "UPDATE public.rate_limit_alert_settings SET is_active = false, min_severity = 'info'" >/dev/null
psql_val "INSERT INTO public.rate_limit_logs (ip_address, endpoint, blocked) SELECT '10.0.4.' || (n % 250), '/rest/v1/deals', true FROM generate_series(1, 50) n" >/dev/null
assert_equal 'GREEN: desligado, 0 alerta' '0' "$(psql_raw "SELECT public.evaluate_rate_limit_alerts()")"
assert_equal 'GREEN: desligado, nada gravado' '0' "$(psql_val "$alerts_total")"
psql_val "UPDATE public.rate_limit_alert_settings SET is_active = true" >/dev/null

# ── entrada invalida barrada pelo CHECK ──────────────────────────────────────
assert_has 'GREEN: limiar invalido (0) e barrado pelo CHECK' 'rate_limit_alert_settings_threshold_check' \
  "$(psql_raw "UPDATE public.rate_limit_alert_settings SET blocked_threshold = 0")"
assert_has 'GREEN: min_severity invalida e barrada pelo CHECK' 'rate_limit_alert_settings_severity_check' \
  "$(psql_raw "UPDATE public.rate_limit_alert_settings SET min_severity = 'urgente'")"

# ── ACL/RLS com o PAPEL REAL ─────────────────────────────────────────────────
admin='{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}'
agente='{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}'
psql_val "INSERT INTO public.user_roles (user_id, role) VALUES ('a0000000-0000-0000-0000-000000000001','admin')" >/dev/null
psql_val "INSERT INTO public.profiles (user_id, role) VALUES ('b0000000-0000-0000-0000-000000000002','agent')" >/dev/null

assert_equal 'CLI: RLS habilitada na tabela de limiares' 'true' \
  "$(psql_val "SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.rate_limit_alert_settings'::regclass")"
assert_equal 'ACL: anon NAO tem SELECT na tabela de limiares' 'false' \
  "$(psql_val "SELECT has_table_privilege('anon','public.rate_limit_alert_settings','SELECT')::text")"
assert_equal 'ACL: authenticated tem SELECT na tabela de limiares' 'true' \
  "$(psql_val "SELECT has_table_privilege('authenticated','public.rate_limit_alert_settings','SELECT')::text")"
assert_equal 'ACL: EXECUTE do avaliador fechado para anon, authenticated e service_role' 'false|false|false' \
  "$(psql_val "SELECT has_function_privilege('anon','public.evaluate_rate_limit_alerts()','EXECUTE')::text || '|' || has_function_privilege('authenticated','public.evaluate_rate_limit_alerts()','EXECUTE')::text || '|' || has_function_privilege('service_role','public.evaluate_rate_limit_alerts()','EXECUTE')::text")"

assert_equal 'RLS: admin le os limiares' '1' "$(as_user "$admin" "SELECT count(*) FROM public.rate_limit_alert_settings" | tail -n1)"
assert_equal 'RLS: agente nao le os limiares (0 linhas)' '0' "$(as_user "$agente" "SELECT count(*) FROM public.rate_limit_alert_settings" | tail -n1)"
assert_equal 'RLS: agente nao edita os limiares (0 linhas afetadas)' '0' \
  "$(as_user "$agente" "WITH up AS (UPDATE public.rate_limit_alert_settings SET blocked_threshold = 999 RETURNING 1) SELECT count(*) FROM up" | tail -n1)"
assert_equal 'RLS: a tentativa do agente nao mudou o valor guardado' '10' \
  "$(psql_val "SELECT blocked_threshold FROM public.rate_limit_alert_settings")"
assert_equal 'RLS: admin edita os limiares (1 linha)' '1' \
  "$(as_user "$admin" "WITH up AS (UPDATE public.rate_limit_alert_settings SET blocked_threshold = 10 RETURNING 1) SELECT count(*) FROM up" | tail -n1)"
assert_has 'RLS: anon e barrado na tabela de limiares' 'permission denied' \
  "$(as_anon "SELECT count(*) FROM public.rate_limit_alert_settings")"
assert_has 'ACL: authenticated nao executa o avaliador' 'permission denied' \
  "$(as_user "$admin" "SELECT public.evaluate_rate_limit_alerts()")"

# ── cron agendado e reaplicavel ──────────────────────────────────────────────
assert_equal 'CRON: job rate-limit-alerts agendado a cada 5 min' '*/5 * * * *' \
  "$(psql_val "SELECT schedule FROM cron.job WHERE jobname = 'rate-limit-alerts'")"
psql_exec < "$migration" >/dev/null || fail 'migration nao reaplicou (idempotencia)'
assert_equal 'CRON: reaplicar a migration nao duplica o job' '1' \
  "$(psql_val "SELECT count(*) FROM cron.job WHERE jobname = 'rate-limit-alerts'")"
assert_equal 'IDEMP: reaplicar nao duplica a linha de limiares' '1' \
  "$(psql_val "SELECT count(*) FROM public.rate_limit_alert_settings")"

# ═══════════════════════════════════════════════════════════════════════════
# ROLLBACK — extraido do proprio arquivo e executado
# ═══════════════════════════════════════════════════════════════════════════
tmp_dir="$(mktemp -d)"
# Extrai SO o bloco de rollback: comeca na linha-marcador e para na primeira linha que nao
# seja um comando `--   <stmt>` (a prosa do cabecalho nao entra).
awk '/^-- Rollback \(SQL execut/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' \
  "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'nao extrai linhas de rollback do arquivo'
psql_exec < "$tmp_dir/rollback.sql" >/dev/null || fail 'rollback nao executou'
rm -rf "$tmp_dir"
assert_equal 'ROLLBACK: tabela de limiares sumiu' 'false' \
  "$(psql_val "SELECT (to_regclass('public.rate_limit_alert_settings') IS NOT NULL)::text")"
assert_equal 'ROLLBACK: avaliador sumiu' 'false' \
  "$(psql_val "SELECT (to_regprocedure('public.evaluate_rate_limit_alerts()') IS NOT NULL)::text")"
assert_equal 'ROLLBACK: job desagendado' '0' \
  "$(psql_val "SELECT count(*) FROM cron.job WHERE jobname = 'rate-limit-alerts'")"
psql_exec < "$migration" >/dev/null || fail 'migration nao reaplicou depois do rollback'
assert_equal 'ROLLBACK: reaplicar restaura o avaliador' 'true' \
  "$(psql_val "SELECT (to_regprocedure('public.evaluate_rate_limit_alerts()') IS NOT NULL)::text")"

echo '[OK] Rate limit: pico de bloqueios agora gera UM alerta no War Room por janela (source=rate_limit, gravidade pelo multiplo do limiar), respeita limiar/gravidade minima/liga-desliga, RLS so admin, EXECUTE so do cron, rollback executavel.'
