#!/usr/bin/env bash
#
# V01 (PLANO_TALKX_V3_100_ETAPAS_2026-09-29): prova, em PostgreSQL 17
# descartavel, que a view public.talkx_campaign_metrics (a) vaza metrica de
# campanha de outro agente enquanto roda como dona e (b) deixa de vazar com
# security_invoker, sem perder o grant que useTalkXInsights usa.
#
# O fixture reproduz o estado real de producao depois de 20260922130000: a
# view existe, tem SELECT para authenticated, e NAO tem security_invoker
# (CREATE OR REPLACE VIEW zera reloptions). O teste roda o guard vivo
# (check-talkx-view-invoker.sql) antes e depois da migration e exige que ele
# falhe antes e passe depois — guard que nunca falha nao guarda nada.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260928410000_fix_talkx_campaign_metrics_security_invoker.sql"
guard_sql="$repo_root/scripts/db-audit/check-talkx-view-invoker.sql"
postgres_image="${TALKX_METRICS_INVOKER_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-metrics-invoker-test-$$"
test_password="talkx_metrics_invoker_test_only"
agent_a_user="11111111-1111-1111-1111-111111111111"
agent_b_user="22222222-2222-2222-2222-222222222222"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-metrics-invoker-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_script() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_sql() { docker exec "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_query() { docker exec "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

# Consulta a view como um ator autenticado. SET LOCAL ROLE + claims e o mesmo
# mecanismo usado no harness real (e em talkx-blacklist-policy-forward-only).
view_count_as_authenticated() {
  local sub="$1"
  docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$sub';
SELECT count(*) FROM public.talkx_campaign_metrics;
COMMIT;
SQL
}

run_guard() {
  local output_var="$1" status_var="$2" guard_output guard_status
  set +e
  guard_output="$(psql_script < "$guard_sql" 2>&1)"
  guard_status=$?
  set -e
  printf -v "$output_var" '%s' "$guard_output"
  printf -v "$status_var" '%s' "$guard_status"
}

assert_guard_passes() {
  local label="$1" output status
  run_guard output status
  if (( status != 0 )) || [[ "$output" != *'OK: talkx_campaign_metrics roda com security_invoker.'* ]]; then
    printf '%s\n' "$output" >&2
    fail "guard deveria passar e nao passou: $label"
  fi
  ((passed += 1))
  printf '[PASS] guard verde — %s\n' "$label"
}

assert_guard_fails() {
  local label="$1" output status
  run_guard output status
  if (( status == 0 )) || [[ "$output" != *'FALHA: a view talkx_campaign_metrics nao roda com security_invoker.'* ]]; then
    printf '%s\n' "$output" >&2
    fail "guard deveria falhar e nao falhou: $label"
  fi
  ((passed += 1))
  printf '[PASS] guard vermelho — %s\n' "$label"
}

assert_view_count() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado $expected, obtido $actual"
  fi
  ((passed += 1))
  printf '[PASS] %s (= %s)\n' "$label" "$actual"
}

assert_reloptions() {
  local label="$1" expected="$2" actual
  actual="$(psql_query "SELECT array_to_string(reloptions, ',') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'talkx_campaign_metrics'")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: reloptions esperado '$expected', obtido '$actual'"
  fi
  ((passed += 1))
  printf '[PASS] %s (reloptions = {%s})\n' "$label" "$actual"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'

psql_script >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed',
  started_at timestamptz,
  completed_at timestamptz
);
ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
-- Mesmo nome e mesma semantica da policy viva de talkx_campaigns: cada agente
-- ve apenas as proprias campanhas.
CREATE POLICY "Users can view own campaigns"
  ON public.talkx_campaigns FOR SELECT TO authenticated
  USING (
    created_by = (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1
    )
  );
GRANT SELECT ON public.talkx_campaigns TO authenticated, service_role;
-- A policy de talkx_campaigns resolve o dono via public.profiles; em producao
-- authenticated tem SELECT nessa tabela (e o que faz a policy funcionar).
GRANT SELECT ON public.profiles TO authenticated, service_role;

INSERT INTO public.profiles(id, user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.talkx_campaigns(id, name, created_by, status, started_at, completed_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Campanha do agente A',
   'aaaaaaaa-0000-0000-0000-000000000001', 'completed', now() - interval '2 h', now() - interval '1 h'),
  ('c0000000-0000-0000-0000-000000000002', 'Campanha do agente B',
   'bbbbbbbb-0000-0000-0000-000000000002', 'completed', now() - interval '2 h', now() - interval '1 h');
SQL

# Estado de producao pos-20260922130000: a view existe, tem SELECT para
# authenticated e NAO tem security_invoker (o CREATE OR REPLACE zerou
# reloptions). Construida aqui, e nao por um arquivo de migration, porque
# nenhuma migration do repo cria a view nesse estado — recriar o arquivo seria
# inventar uma migration.
create_vulnerable_view() {
  psql_script >/dev/null <<'SQL'
DROP VIEW IF EXISTS public.talkx_campaign_metrics;
CREATE VIEW public.talkx_campaign_metrics AS
SELECT c.id AS campaign_id,
       c.name AS campaign_name,
       c.status,
       c.started_at,
       c.completed_at
FROM public.talkx_campaigns c
WHERE c.status = 'completed'
  AND c.started_at IS NOT NULL
  AND c.completed_at IS NOT NULL;
GRANT SELECT ON public.talkx_campaign_metrics TO authenticated, service_role;
SQL
}

apply_migration() { psql_script < "$migration" >/dev/null; }

# CREATE OR REPLACE VIEW mantem a view e as colunas, mas zera reloptions — foi
# assim que 20260922130000 desfez o security_invoker em producao.
recreate_view_via_create_or_replace() {
  psql_script >/dev/null <<'SQL'
CREATE OR REPLACE VIEW public.talkx_campaign_metrics AS
SELECT c.id AS campaign_id,
       c.name AS campaign_name,
       c.status,
       c.started_at,
       c.completed_at
FROM public.talkx_campaigns c
WHERE c.status = 'completed'
  AND c.started_at IS NOT NULL
  AND c.completed_at IS NOT NULL;
SQL
}

create_vulnerable_view
assert_guard_fails 'view sem security_invoker (estado de producao)'

# O vazamento e real, nao hipotetico: como agente A a view devolve tambem a
# campanha do agente B, apesar da RLS de talkx_campaigns.
assert_view_count 'agente A le 2 campanhas pela view (vazamento)' '2' \
  "$(view_count_as_authenticated "$agent_a_user")"
assert_view_count 'agente B le 2 campanhas pela view (vazamento)' '2' \
  "$(view_count_as_authenticated "$agent_b_user")"

apply_migration
apply_migration   # idempotencia: reaplicar nao pode falhar
assert_reloptions 'migration V01 aplicada' 'security_invoker=true'
assert_guard_passes 'migration V01 aplicada'

assert_view_count 'agente A le so a propria campanha' '1' \
  "$(view_count_as_authenticated "$agent_a_user")"
assert_view_count 'agente B le so a propria campanha' '1' \
  "$(view_count_as_authenticated "$agent_b_user")"
assert_view_count 'service_role continua lendo as 2 (backend intacto)' '2' \
  "$(psql_query "SELECT count(*) FROM public.talkx_campaign_metrics")"

# Mutações: cada uma reproduz uma regressao plausivel e o guard precisa
# detecta-la. Sem isto, o guard so estaria provando que "roda".
reset_fixture() { create_vulnerable_view; apply_migration; }

reset_fixture
psql_sql 'ALTER VIEW public.talkx_campaign_metrics RESET (security_invoker)' >/dev/null
assert_guard_fails 'security_invoker removido por RESET'

reset_fixture
recreate_view_via_create_or_replace
assert_guard_fails 'view recriada com CREATE OR REPLACE (regressao 20260922130000)'

reset_fixture
psql_sql 'REVOKE SELECT ON public.talkx_campaign_metrics FROM authenticated' >/dev/null
assert_guard_fails 'SELECT de authenticated revogado (quebraria useTalkXInsights)'

reset_fixture
psql_sql 'DROP VIEW public.talkx_campaign_metrics' >/dev/null
assert_guard_fails 'view ausente'

printf '[OK] Talk X V01: view de metricas vaza sem security_invoker e para de vazar com ela (%s cenarios aprovados).\n' "$passed"
