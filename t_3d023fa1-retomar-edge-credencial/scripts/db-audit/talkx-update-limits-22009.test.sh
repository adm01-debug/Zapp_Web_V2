#!/usr/bin/env bash
set -Eeuo pipefail

# V09e do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 — fecha o vazamento de SQLSTATE 22009
# (invalid_time_zone_displacement) na RPC update_talkx_campaign_limits (achado A1 da
# auditoria adversarial Onda 2, 2026-09-30).
#
# Prova, em PostgreSQL 17 descartável, que offset de fuso fora de faixa em
# send_window_start/end vira invalid_talkx_limits_values (22023), sem vazar o 22009 cru:
#   f) send_window_end  '10:00:00+99' -> 22023 (antes: 22009 invalid_time_zone_displacement);
#   g) send_window_start '10:00:00+16' -> 22023 (antes: 22009);
#   h) send_window_start '10:00:00+03' -> grava 10:00:00 (offset válido, sem erro — regressão);
#   i) payload válido                     -> grava e incrementa revision (regressão).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_UPDATE_LIMITS_22009_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-update-limits-22009-$RANDOM-$$"
test_password="***"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-update-limits-22009-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="***" "$postgres_image" >/dev/null

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

# ---- fixtures minimos (mesmos da V09/V09c) ----
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
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
GRANT SELECT, UPDATE ON public.talkx_campaigns TO authenticated;
SQL

# ---- aplica V09 + V09c + V09e (substitui a RPC); replayavel ----
v09="$repo_root/supabase/migrations/20260930180000_talkx_update_campaign_limits_rpc.sql"
v09c="$repo_root/supabase/migrations/20260930340000_talkx_update_campaign_limits_casts.sql"
v09e="$repo_root/supabase/migrations/20260930380000_talkx_update_campaign_limits_22009.sql"
[[ -f "$v09" ]] || fail 'migration da V09 nao existe'
[[ -f "$v09c" ]] || fail 'migration da V09c nao existe'
[[ -f "$v09e" ]] || fail 'migration da V09e nao existe'
psql_test < "$v09" >/dev/null || fail 'V09 nao aplicou'
psql_test < "$v09c" >/dev/null || fail 'V09c nao aplicou'
psql_test < "$v09e" >/dev/null || fail 'V09e nao aplicou'
psql_test < "$v09e" >/dev/null || fail 'V09e nao e replayavel (segunda aplicacao falhou)'

# ---- campanha de fixture (dono = perfil do usuário authenticated) ----
psql_test -q <<'SQL' >/dev/null
INSERT INTO public.talkx_campaigns(id, status, created_by, total_recipients, revision)
VALUES ('30000000-0000-0000-0000-000000000001', 'sending', '10000000-0000-0000-0000-000000000001', 5, 1);
SQL

camp_id='30000000-0000-0000-0000-000000000001'

# helper: chama a RPC como dono e devolve o stderr/stdout
rpc() {
  psql_test 2>&1 <<SQL || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits('$camp_id', 1, '$1'::jsonb);
COMMIT;
SQL
}

# ---- f) offset de fuso fora de faixa em end => 22023 (nao 22009) ----
f="$(rpc '{"send_window_end":"10:00:00+99"}')"
echo "$f" | grep -q 'invalid_talkx_limits_values' || fail "f) '10:00:00+99' deveria dar invalid_talkx_limits_values: $f"
echo "$f" | grep -qE '22009|time zone displacement out of range' && fail "f) vazou 22009 (time zone displacement): $f"

# ---- g) offset de fuso fora de faixa em start => 22023 (nao 22009) ----
g="$(rpc '{"send_window_start":"10:00:00+16"}')"
echo "$g" | grep -q 'invalid_talkx_limits_values' || fail "g) '10:00:00+16' deveria dar invalid_talkx_limits_values: $g"
echo "$g" | grep -qE '22009|time zone displacement out of range' && fail "g) vazou 22009 (time zone displacement): $g"

# ---- h) offset VÁLIDO (+03, dentro de ±15:59) => grava 10:00:00 (regressão) ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits('$camp_id', 1, '{"send_window_start":"10:00:00+03","send_window_end":"18:00:00"}'::jsonb);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT send_window_start::text FROM public.talkx_campaigns WHERE id='$camp_id'")" == '10:00:00' ]] \
  || fail 'h) offset válido não gravou 10:00:00'

# ---- i) payload válido => grava (regressão) ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits('$camp_id', 2, '{"speed_profile":"fast"}'::jsonb);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'fast' ]] \
  || fail 'i) payload valido nao gravou speed_profile=fast'

printf '[OK] Talk X V09e: offset de fuso fora de faixa vira 22023 (sem vazar 22009); offset válido preserva a janela.\n'
