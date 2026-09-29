#!/usr/bin/env bash
#
# V02 (PLANO_TALKX_V3_100_ETAPAS_2026-09-29): prova, contra um PostgREST REAL e
# sem nenhum mock, que:
#   1. com os dois overloads de public.transition_talkx_campaign vivos, a
#      chamada de 2 argumentos que o talkx-send usa em 5 pontos responde
#      HTTP 300 PGRST203 — start/pause/cancel quebrados em produção;
#   2. com o CHECK de public.talkx_campaigns.status sem 'scheduled', gravar o
#      status que o front grava ao agendar é recusado pelo banco;
#   3. depois da migration 20260929420000 sobram 1 assinatura e o ciclo
#      draft -> sending -> paused -> sending -> cancelled responde 200.
#
# As funções não são transcritas: as migrations REAIS do repo (20260911150000
# cria a de 2 args, 20260916210000 cria a de 3) são aplicadas no PostgreSQL 17
# descartável, sobre um schema mínimo com as colunas que a RPC toca (conferidas
# ao vivo no banco canônico). O PostgREST só entra depois que o estado "de
# produção" está montado, e é recarregado com NOTIFY pgrst após o DDL — sem
# isso ele responde do cache de schema e o teste mediria a si mesmo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260929420000_fix_talkx_transition_overload_and_status_check.sql"
legacy_2arg="$repo_root/supabase/migrations/20260911150000_add_talkx_campaign_transition_rpc.sql"
current_3arg="$repo_root/supabase/migrations/20260916210000_talkx_e91_resilience.sql"
guard_sql="$repo_root/scripts/db-audit/check-talkx-transition-contract.sql"
deno_test="$repo_root/scripts/db-audit/talkx-transition-postgrest.test.ts"

pg_image="${TALKX_TRANSITION_POSTGREST_PG_IMAGE:-postgres:17-alpine}"
pgrst_image="${TALKX_TRANSITION_POSTGREST_IMAGE:-public.ecr.aws/supabase/postgrest:v14.5}"
pg_name="zapp-talkx-transition-pg-$$"
pgrst_name="zapp-talkx-transition-pgrst-$$"
net_name="zapp-talkx-transition-net-$$"
jwt_secret="talkx-transition-postgrest-test-secret-32-chars"
campaign_id="40000000-0000-0000-0000-0000000000a2"
passed=0

cleanup() {
  if [[ "$pg_name" =~ ^zapp-talkx-transition-pg-[0-9]+$ ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
  if [[ "$pgrst_name" =~ ^zapp-talkx-transition-pgrst-[0-9]+$ ]]; then
    docker rm -f "$pgrst_name" >/dev/null 2>&1 || true
  fi
  if [[ "$net_name" =~ ^zapp-talkx-transition-net-[0-9]+$ ]]; then
    docker network rm "$net_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { passed=$((passed + 1)); printf '[PASS] %s\n' "$1"; }

psql_script() { docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_query() { docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

run_guard() {
  # Os locais do helper NAO podem se chamar `output`/`status`: printf -v
  # resolveria para o local do proprio helper (escopo dinamico) e o chamador
  # ficaria com a variavel declarada e vazia — `(( status == 0 ))` entao morre
  # com "unbound variable" por causa do set -u.
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
  if (( status != 0 )) || [[ "$output" != *'OK: transition_talkx_campaign com assinatura unica'* ]]; then
    printf '%s\n' "$output" >&2
    fail "guarda deveria passar: $label"
  fi
  pass "guarda verde — $label"
}

assert_guard_fails() {
  local label="$1" output status
  run_guard output status
  if (( status == 0 )) || [[ "$output" != *'FALHA: contrato de transicao de campanha do Talk X foi violado.'* ]]; then
    printf '%s\n' "$output" >&2
    fail "guarda deveria falhar: $label"
  fi
  pass "guarda vermelha — $label"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}

assert_deno() {
  local label="$1" expect_ambiguous="$2"
  TALKX_EXPECT_AMBIGUOUS="$expect_ambiguous" \
    TALKX_POSTGREST_URL="http://$pgrst_ip:3000" \
    TALKX_POSTGREST_JWT="$jwt" \
    TALKX_CAMPAIGN_ID="$campaign_id" \
    deno test --allow-net --allow-env --no-config "$deno_test" >/tmp/talkx-transition-deno.log 2>&1 \
    || { cat /tmp/talkx-transition-deno.log >&2; fail "deno test falhou: $label"; }
  pass "$label ($(grep -oE '[0-9]+ passed' /tmp/talkx-transition-deno.log | tail -1))"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
command -v deno >/dev/null 2>&1 || fail 'Deno nao esta instalado'

docker network create "$net_name" >/dev/null
docker run --rm -d --name "$pg_name" --network "$net_name" \
  -e POSTGRES_PASSWORD=transition_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$pg_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$pg_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'

# ---- estado "de produção": vocabulário antigo de status + os dois overloads ----
psql_script >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'campanha de teste',
  status text NOT NULL DEFAULT 'draft'
    -- CHECK vivo ANTES da V02 (5 status, sem 'scheduled')
    CONSTRAINT talkx_campaigns_status_check
    CHECK (status = ANY (ARRAY['draft', 'sending', 'paused', 'completed', 'cancelled'])),
  message_template text NOT NULL DEFAULT 'olá {{nome}}',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
);
GRANT SELECT ON public.talkx_campaigns, public.talkx_recipients TO service_role;

INSERT INTO public.talkx_campaigns(id, status, total_recipients, message_template)
VALUES ('40000000-0000-0000-0000-0000000000a2', 'draft', 1, 'olá {{nome}}');
INSERT INTO public.talkx_recipients(campaign_id)
VALUES ('40000000-0000-0000-0000-0000000000a2');
SQL

# Migrations reais: a de 2 args e a de 3 args com p_pause_reason DEFAULT NULL.
psql_script < "$legacy_2arg" >/dev/null
psql_script < "$current_3arg" >/dev/null

# ---- fase 1: estado de produção, sem a V02 ----
assert_eq 'dois overloads vivos antes da migration' '2' \
  "$(psql_query "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'transition_talkx_campaign'")"
assert_guard_fails 'contrato antes da V02'

set +e
scheduled_before="$(psql_query "INSERT INTO public.talkx_campaigns(id, status) VALUES ('40000000-0000-0000-0000-0000000000b2', 'scheduled')" 2>&1)"
scheduled_before_status=$?
set -e
if (( scheduled_before_status == 0 )); then
  psql_query "DELETE FROM public.talkx_campaigns WHERE id = '40000000-0000-0000-0000-0000000000b2'" >/dev/null
  fail "gravar status='scheduled' deveria violar o CHECK antes da V02"
fi
[[ "$scheduled_before" == *'talkx_campaigns_status_check'* ]] \
  || fail "erro inesperado ao gravar 'scheduled': $scheduled_before"
pass "status='scheduled' é recusado pelo CHECK antes da V02"

docker run --rm -d --name "$pgrst_name" --network "$net_name" \
  -e PGRST_DB_URI="postgres://postgres:transition_test_only@$pg_name:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$jwt_secret" \
  -e PGRST_SERVER_PORT=3000 \
  "$pgrst_image" >/dev/null

pgrst_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$pgrst_name")"
postgrest_ready=false
for _ in $(seq 1 60); do
  # http:// aqui e o proprio objeto sob teste: o PostgREST e descartavel, numa
  # rede docker isolada criada por este script, sem dado de cliente e sem
  # credencial real (segredo e senha sao literais de teste, gerados no run).
  # Nao ha comparador TLS a testar: o alvo e a ambiguidade do overload na RPC.
  if curl -sf "http://$pgrst_ip:3000/" >/dev/null 2>&1; then # NOSONAR
    postgrest_ready=true
    break
  fi
  sleep 1
done
[[ "$postgrest_ready" == true ]] || fail 'PostgREST não subiu'

jwt="$(JWT_SECRET="$jwt_secret" python3 - <<'PY'
import base64, hashlib, hmac, json, os, time
def b64(raw): return base64.urlsafe_b64encode(raw).rstrip(b'=')
secret = os.environ['JWT_SECRET'].encode()
header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
payload = b64(json.dumps({"role": "service_role", "exp": int(time.time()) + 3600}, separators=(',', ':')).encode())
signature = b64(hmac.new(secret, header + b'.' + payload, hashlib.sha256).digest())
print((header + b'.' + payload + b'.' + signature).decode())
PY
)"

assert_deno 'PGRST203 com os dois overloads (sem mock)' '1'

# ---- aplica a V02 e recarrega o schema do PostgREST ----
psql_script < "$migration" >/dev/null
psql_query "NOTIFY pgrst, 'reload schema'" >/dev/null
sleep 3

assert_eq 'uma assinatura depois da migration' '1' \
  "$(psql_query "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'transition_talkx_campaign'")"
assert_eq 'assinatura mantida é a de 3 args com DEFAULT' '3|1' \
  "$(psql_query "SELECT p.pronargs || '|' || p.pronargdefaults FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'transition_talkx_campaign'")"
assert_guard_passes 'contrato depois da V02'

psql_query "INSERT INTO public.talkx_campaigns(id, status) VALUES ('40000000-0000-0000-0000-0000000000b2', 'scheduled')" >/dev/null
assert_eq "status='scheduled' aceito depois da V02" 'scheduled' \
  "$(psql_query "SELECT status FROM public.talkx_campaigns WHERE id = '40000000-0000-0000-0000-0000000000b2'")"
psql_query "DELETE FROM public.talkx_campaigns WHERE id = '40000000-0000-0000-0000-0000000000b2'" >/dev/null

# ---- fase 2: ciclo de vida completo pela RPC, ainda sem mock ----
assert_deno 'ciclo draft -> sending -> paused -> sending -> cancelled' '0'

printf '[OK] Talk X V02: overload ambiguo derruba start/pause/cancel no PostgREST real, o CHECK recusa scheduled, e a migration resolve os dois (%s cenarios).\n' "$passed"
