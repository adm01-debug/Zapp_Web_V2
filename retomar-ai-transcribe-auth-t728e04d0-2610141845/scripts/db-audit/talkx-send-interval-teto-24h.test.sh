#!/usr/bin/env bash
set -Eeuo pipefail

# A2 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29: teto semântico de send_interval_max = 24h.
#
# Prova, em PostgreSQL 17 descartável, que:
#  1) a CHECK de banco rejeita escrita DIRETA com send_interval_max > 86400000 (23514);
#  2) a CHECK aceita o limite exato de 24h (86400000) e um valor normal;
#  3) a RPC update_talkx_campaign_limits rejeita send_interval_max > 86400000 com
#     22023 gracioso (invalid_talkx_limits_values), não o 23514 cru;
#  4) a RPC aceita 86400000 (24h exatos) e um valor normal (5000ms).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_SEND_INTERVAL_TETO_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-teto-$RANDOM-$$"
test_password="talkx_teto_24h_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-teto-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

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
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos (espelham o que a migration referencia) ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;

CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE,
  role text NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);

CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.profiles WHERE user_id = p_user AND role IN ('admin', 'supervisor')
) $$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  scheduled_at timestamptz,
  speed_profile text NOT NULL DEFAULT 'moderate',
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profiles(id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'agent');

GRANT SELECT, INSERT, UPDATE ON public.talkx_campaigns TO authenticated;
SQL

# ---- aplica a migration A2 (CHECK + RPC); replayavel ----
migration="$repo_root/supabase/migrations/20260930550000_talkx_send_interval_max_teto_24h.sql"
[[ -f "$migration" ]] || fail 'migration A2 nao existe'
psql_test < "$migration" >/dev/null || fail 'A2 nao aplicou'
psql_test < "$migration" >/dev/null || fail 'A2 nao e replayavel (segunda aplicacao falhou)'

# ---- campanha draft de fixture ----
psql_test -q <<'SQL' >/dev/null
INSERT INTO public.talkx_campaigns(id, status, created_by, revision)
VALUES ('30000000-0000-0000-0000-000000000001', 'draft', '10000000-0000-0000-0000-000000000001', 1);
SQL

# ---- 1) CHECK rejeita escrita DIRETA acima de 24h (23514) ----
check_out="$(psql_test 2>&1 <<'SQL' || true
UPDATE public.talkx_campaigns SET send_interval_max = 2147483647
 WHERE id = '30000000-0000-0000-0000-000000000001';
SQL
)"
echo "$check_out" | grep -q 'talkx_campaigns_send_interval_max_check' \
  || fail "CHECK nao rejeitou send_interval_max=2147483647 (esperava violacao da CHECK): $check_out"

# ---- 2) CHECK aceita o limite exato de 24h e valor normal ----
psql_test -q <<'SQL' >/dev/null
UPDATE public.talkx_campaigns SET send_interval_max = 86400000
 WHERE id = '30000000-0000-0000-0000-000000000001';
SQL
[[ "$(psql_test -Atqc "SELECT send_interval_max FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == '86400000' ]] \
  || fail 'CHECK nao aceitou send_interval_max=86400000 (limite exato de 24h)'

# ---- 3) RPC rejeita send_interval_max > 24h com 22023 gracioso ----
rpc_over_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 1,
  '{"send_interval_max":86400001}'::jsonb
);
COMMIT;
SQL
)"
echo "$rpc_over_out" | grep -q 'invalid_talkx_limits_values' \
  || fail "RPC nao rejeitou send_interval_max=86400001 com 22023 (esperava invalid_talkx_limits_values): $rpc_over_out"
echo "$rpc_over_out" | grep -qv 'talkx_campaigns_send_interval_max_check' \
  || fail "RPC deixou vazar o 23514 cru da CHECK (deveria emitir 22023): $rpc_over_out"

# ---- 4) RPC aceita 86400000 (24h exatos) ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 1,
  '{"send_interval_max":86400000}'::jsonb
);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT send_interval_max FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == '86400000' ]] \
  || fail 'RPC nao aceitou send_interval_max=86400000 (24h exatos)'

# ---- 5) RPC aceita valor normal (5000ms) ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 2,
  '{"send_interval_max":5000}'::jsonb
);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT send_interval_max FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == '5000' ]] \
  || fail 'RPC nao aceitou send_interval_max=5000 (valor normal)'

printf '[OK] Talk X A2: teto de send_interval_max = 24h aplicado na CHECK e na RPC (22023 gracioso); limite exato e valor normal aceitos.\n'
