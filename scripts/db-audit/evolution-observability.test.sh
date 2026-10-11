#!/usr/bin/env bash
# Prova em PG descartavel da observabilidade da Evolution (migration
# 20261011184530_evolution_observability.sql). Cobre:
#   A. estrutura: as duas tabelas existem e nascem com RLS ligada;
#   B. RLS/GRANT: leitura so admin (policy explicita, sem USING (true)),
#      escrita so service_role (INSERT), anon sem nada, sem UPDATE/DELETE;
#   C. comportamento com papel REAL: service_role grava; authenticated nao-admin
#      ve 0 linha; admin ve tudo; authenticated nao insere; anon nao le;
#   D. agregacao: evolution_api_calls_overview / webhook_events_overview devolvem
#      contagem, taxa de erro, media e p90 corretos; quem nao e admin recebe 42501;
#      anon nao executa;
#   E. retencao: evolution_observability_retention(30) apaga so o que passou de 30
#      dias, devolve a contagem, e nao e executavel por usuario final;
#   F. contrato: CHECKs barram endpoint sem "/", endpoint com query, metodo e
#      status invalidos, latencia negativa, processing_status fora do dominio;
#   G. job de retencao agendado no pg_cron, uma vez, com a cadencia declarada.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Aceita caminho da migration como 1o argumento (para a prova vermelha); default a real.
migration="${1:-$repo_root/supabase/migrations/20261011184530_evolution_observability.sql}"
container="zapp-v2-evolution-obs-test-$$"
img="${EVOLUTION_OBS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
FALHAS=0
ADMIN='00000000-0000-0000-0000-0000000000a1'
AGENT='00000000-0000-0000-0000-0000000000a2'

ok()   { echo "  [OK]     $*"; }
ruim() { echo "  [FALHOU] $*"; FALHAS=$((FALHAS+1)); }

cleanup() {
  if [[ "$container" =~ ^zapp-v2-evolution-obs-test-[0-9]+$ ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || { echo "docker ausente"; exit 2; }
docker info >/dev/null 2>&1 || { echo "docker daemon inacessivel"; exit 2; }
[[ -f "$migration" ]] || { echo "migration nao encontrada: $migration"; exit 2; }

docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=evo_test_only "$img" >/dev/null
for _ in $(seq 1 90); do
  docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 || { echo "PG nao subiu"; exit 2; }

# Consultas de valor unico (falha alto).
q()  { docker exec -i -e PGPASSWORD=evo_test_only "$container" psql -U postgres -d postgres -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
# Bloco SQL multi-statement (SET ROLE etc.).
qq() { docker exec -i -e PGPASSWORD=evo_test_only "$container" psql -U postgres -d postgres -X -q -A -t -v ON_ERROR_STOP=1; }
# Executa e devolve o codigo de saida, sem abortar o teste.
soft() { docker exec -i -e PGPASSWORD=evo_test_only "$container" psql -U postgres -d postgres -X -q -A -t -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; echo $?; }

assert_eq() {
  local label="$1" expected="$2" got="$3"
  if [[ "$got" == "$expected" ]]; then ok "$label (=$got)"; else ruim "$label: esperado [$expected], obtido [$got]"; fi
}

# ------------------------------------------------------------- bootstrap (A)
qq >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$fn$;
CREATE TABLE public.user_roles (user_id uuid, role text);
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$fn$;
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid    bigserial PRIMARY KEY,
  jobname  text NOT NULL UNIQUE,
  schedule text NOT NULL,
  command  text NOT NULL DEFAULT 'select 1'
);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
LANGUAGE plpgsql AS $fn$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cron.job(jobname, schedule, command) VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
    RETURNING jobid INTO v_id;
  RETURN v_id;
END;
$fn$;
CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean
LANGUAGE plpgsql AS $fn$
DECLARE v_rows integer;
BEGIN
  DELETE FROM cron.job WHERE jobname = job_name;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$fn$;
SQL

qq < "$migration" >/dev/null

# ------------------------------------------------------------- A. estrutura
assert_eq "duas tabelas com RLS ligada" "2" \
  "$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('evolution_api_calls','webhook_events_log') AND c.relrowsecurity")"

# ------------------------------------------------------------- B. RLS + GRANT
assert_eq "policy de leitura do admin (authenticated)" "2" \
  "$(q "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('evolution_api_calls','webhook_events_log') AND cmd='SELECT' AND roles='{authenticated}' AND qual LIKE '%is_admin%'")"
assert_eq "nenhuma policy para anon" "0" \
  "$(q "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('evolution_api_calls','webhook_events_log') AND roles::text LIKE '%anon%'")"
assert_eq "nenhuma policy USING (true) para PUBLIC" "0" \
  "$(q "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('evolution_api_calls','webhook_events_log') AND roles='{public}'")"
assert_eq "authenticated: so SELECT em evolution_api_calls" "SELECT" \
  "$(q "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='evolution_api_calls' AND grantee='authenticated'")"
assert_eq "authenticated: so SELECT em webhook_events_log" "SELECT" \
  "$(q "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='webhook_events_log' AND grantee='authenticated'")"
assert_eq "service_role: so INSERT em evolution_api_calls" "INSERT" \
  "$(q "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='evolution_api_calls' AND grantee='service_role'")"
assert_eq "service_role: so INSERT em webhook_events_log" "INSERT" \
  "$(q "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='webhook_events_log' AND grantee='service_role'")"
assert_eq "anon sem privilegio em evolution_api_calls" "" \
  "$(q "SELECT COALESCE(string_agg(privilege_type, ',' ORDER BY privilege_type), '') FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='evolution_api_calls' AND grantee='anon'")"
assert_eq "anon sem privilegio em webhook_events_log" "" \
  "$(q "SELECT COALESCE(string_agg(privilege_type, ',' ORDER BY privilege_type), '') FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='webhook_events_log' AND grantee='anon'")"

# ------------------------------------------------------------- C. escrita real
qq >/dev/null <<'SQL'
SET ROLE service_role;
INSERT INTO public.evolution_api_calls (instance, endpoint, method, ok, latency_ms, attempt, retry_reason, error_code) VALUES
  ('inst-a', '/message/sendText', 'POST', true,  120, 1, NULL, NULL),
  ('inst-a', '/message/sendText', 'POST', false, 300, 2, 'timeout', 'ETIMEDOUT'),
  ('inst-b', '/instance/connect', 'GET',  false, 50,  1, NULL, 'ECONNREFUSED');
INSERT INTO public.evolution_api_calls (created_at, endpoint, method, ok) VALUES
  (now() - interval '40 days', '/health', 'GET', true);
INSERT INTO public.webhook_events_log (instance, event_type, message_type, processing_status, latency_ms, error_code) VALUES
  ('inst-a', 'messages.upsert', 'text', 'ok', 80, NULL),
  ('inst-a', 'messages.upsert', 'image', 'error', 200, 'PARSE_ERROR'),
  ('inst-b', 'connection.update', NULL, 'ignored', 20, NULL);
INSERT INTO public.webhook_events_log (received_at, event_type, processing_status) VALUES
  (now() - interval '40 days', 'old.event', 'ok');
RESET ROLE;
SQL
assert_eq "service_role gravou 4 chamadas / 4 eventos" "4|4" \
  "$(q "SELECT (SELECT count(*) FROM public.evolution_api_calls)||'|'||(SELECT count(*) FROM public.webhook_events_log)")"

q "INSERT INTO public.user_roles(user_id, role) VALUES ('$ADMIN','admin');" >/dev/null

assert_eq "nao-admin ve 0 linha" "0" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$AGENT\"}'; SELECT count(*) FROM public.evolution_api_calls;")"
assert_eq "admin ve todas as linhas" "4" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT count(*) FROM public.evolution_api_calls;")"
assert_eq "admin ve os eventos" "4" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT count(*) FROM public.webhook_events_log;")"

if [[ "$(soft "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; INSERT INTO public.evolution_api_calls (endpoint, method, ok) VALUES ('/x','GET',true);")" == "0" ]]; then
  ruim "authenticated conseguiu INSERIR (deveria ser negado)"
else
  ok "authenticated nao insere (negado)"
fi
if [[ "$(soft "SET ROLE anon; SELECT count(*) FROM public.evolution_api_calls;")" == "0" ]]; then
  ruim "anon conseguiu LER (deveria ser negado)"
else
  ok "anon nao le (negado)"
fi

# ------------------------------------------------------------- D. agregacao
assert_eq "overview: chamadas 24h (fora a antiga)" "3" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT public.evolution_api_calls_overview(24) -> 'totals' ->> 'calls';")"
assert_eq "overview: taxa de erro 24h" "0.6667" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT public.evolution_api_calls_overview(24) -> 'totals' ->> 'error_rate';")"
assert_eq "overview: media de latencia" "157" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT public.evolution_api_calls_overview(24) -> 'totals' ->> 'avg_latency_ms';")"
assert_eq "overview: p90 de latencia" "264" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT public.evolution_api_calls_overview(24) -> 'totals' ->> 'p90_latency_ms';")"
assert_eq "overview: 2 instancias" "2" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT jsonb_array_length(public.evolution_api_calls_overview(24) -> 'by_instance');")"

assert_eq "webhook overview: eventos e taxa de erro" "3|0.3333" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT (public.webhook_events_overview(24) -> 'totals' ->> 'events')||'|'||(public.webhook_events_overview(24) -> 'totals' ->> 'error_rate');")"
assert_eq "webhook overview: media p90" "100|176" \
  "$(q "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ADMIN\"}'; SELECT (public.webhook_events_overview(24) -> 'totals' ->> 'avg_latency_ms')||'|'||(public.webhook_events_overview(24) -> 'totals' ->> 'p90_latency_ms');")"

if [[ "$(soft "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$AGENT\"}'; SELECT public.evolution_api_calls_overview(24);")" == "0" ]]; then
  ruim "nao-admin executou a agregacao (deveria ser negado)"
else
  ok "nao-admin nao executa a agregacao (negado)"
fi
if [[ "$(soft "SET ROLE anon; SELECT public.webhook_events_overview(24);")" == "0" ]]; then
  ruim "anon executou a agregacao (deveria ser negado)"
else
  ok "anon nao executa a agregacao (negado)"
fi

# ------------------------------------------------------------- E. retencao
assert_eq "retencao devolve 2 linhas expurgadas" "2" \
  "$(q "SELECT public.evolution_observability_retention(30);")"
assert_eq "restou so o que e recente" "3|3" \
  "$(q "SELECT (SELECT count(*) FROM public.evolution_api_calls)||'|'||(SELECT count(*) FROM public.webhook_events_log)")"
if [[ "$(soft "SET ROLE authenticated; SELECT public.evolution_observability_retention(30);")" == "0" ]]; then
  ruim "authenticated executou o expurgo (deveria ser negado)"
else
  ok "usuario final nao executa o expurgo (negado)"
fi

# ------------------------------------------------------------- F. contrato CHECK
check_rejeita() {
  local label="$1" sql="$2"
  if [[ "$(soft "$sql")" == "0" ]]; then ruim "$label (deveria ser rejeitado)"; else ok "$label (rejeitado)"; fi
}
check_rejeita "endpoint sem barra inicial" \
  "INSERT INTO public.evolution_api_calls (endpoint, method, ok) VALUES ('message/send','POST',true);"
check_rejeita "endpoint com query string" \
  "INSERT INTO public.evolution_api_calls (endpoint, method, ok) VALUES ('/x?token=segredo','POST',true);"
check_rejeita "metodo fora do dominio" \
  "INSERT INTO public.evolution_api_calls (endpoint, method, ok) VALUES ('/x','FETCH',true);"
check_rejeita "status fora de 100..599" \
  "INSERT INTO public.evolution_api_calls (endpoint, method, ok, status_code) VALUES ('/x','POST',true,999);"
check_rejeita "latencia negativa" \
  "INSERT INTO public.evolution_api_calls (endpoint, method, ok, latency_ms) VALUES ('/x','POST',true,-5);"
check_rejeita "processing_status fora do dominio" \
  "INSERT INTO public.webhook_events_log (event_type, processing_status) VALUES ('messages.upsert','talvez');"

# ------------------------------------------------------------- G. job pg_cron
assert_eq "job de retencao agendado uma vez" "1" \
  "$(q "SELECT count(*) FROM cron.job WHERE jobname='evolution-observability-retention'")"
assert_eq "cadencia do job" "30 4 * * *" \
  "$(q "SELECT schedule FROM cron.job WHERE jobname='evolution-observability-retention'")"

# ------------------------------------------------------------- H. rollback executavel
rollback_sql="$(awk '/^-- Rollback \(SQL/ {f=1; next} f { if ($0 ~ /^--   /) print substr($0,6); else exit }' "$migration")"
if [[ -z "$rollback_sql" ]]; then
  ruim "rollback executavel nao encontrado na migration"
else
  printf '%s\n' "$rollback_sql" | qq >/dev/null
  assert_eq "rollback removeu as tabelas" "0" \
    "$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('evolution_api_calls','webhook_events_log')")"
  assert_eq "rollback removeu as funcoes" "0" \
    "$(q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('evolution_api_calls_overview','webhook_events_overview','evolution_observability_retention')")"
  assert_eq "rollback removeu o job do pg_cron" "0" \
    "$(q "SELECT count(*) FROM cron.job WHERE jobname='evolution-observability-retention'")"
fi

echo
if (( FALHAS == 0 )); then
  echo "evolution-observability ($img): todos os cenarios passaram."
else
  echo "evolution-observability ($img): $FALHAS cenario(s) falharam." >&2
  exit 1
fi
