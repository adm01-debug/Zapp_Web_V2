#!/usr/bin/env bash
set -Eeuo pipefail

# V09c do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 — endurece a conversão de tipos na RPC
# update_talkx_campaign_limits (achado da auditoria: casts vazavam 22P02/22003/22007).
#
# Prova, em PostgreSQL 17 descartável, que a RPC converte qualquer erro de cast em
# invalid_talkx_limits_values (22023), sem vazar o SQLSTATE cru:
#   a) texto inválido em integer      -> 22023 (antes: 22P02 invalid_text_representation);
#   b) hora inválida em ::time        -> 22023 (antes: 22007 invalid_datetime_format);
#   c) número fora do range do integer-> 22023 (antes: 22003 numeric_value_out_of_range, o "teto");
#   d) business_hours_only ''         -> tratado como ausente (antes: 22P02 no cast sem NULLIF, o "no-op");
#   e) payload válido                 -> grava e incrementa revision (regressão).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_UPDATE_LIMITS_CASTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-update-limits-casts-$RANDOM-$$"
test_password="talkx_update_limits_casts_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-update-limits-casts-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

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

# ---- fixtures minimos (mesmos da V09) ----
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

# ---- aplica V09 (ambas funcoes) + V09c (substitui a RPC); replayavel ----
v09="$repo_root/supabase/migrations/20260930180000_talkx_update_campaign_limits_rpc.sql"
v09c="$repo_root/supabase/migrations/20260930340000_talkx_update_campaign_limits_casts.sql"
[[ -f "$v09" ]] || fail 'migration da V09 nao existe'
[[ -f "$v09c" ]] || fail 'migration da V09c nao existe'
psql_test < "$v09" >/dev/null || fail 'V09 nao aplicou'
psql_test < "$v09c" >/dev/null || fail 'V09c nao aplicou'
psql_test < "$v09c" >/dev/null || fail 'V09c nao e replayavel (segunda aplicacao falhou)'

# ---- trigger vivo ----
psql_test -q -c 'CREATE TRIGGER enforce_talkx_campaign_mutability BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();' >/dev/null

# ---- campanha `sending` de fixture ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.talkx_campaigns(id, status, created_by, total_recipients, revision)
VALUES ('30000000-0000-0000-0000-000000000001', 'sending', '10000000-0000-0000-0000-000000000001', 5, 1);
COMMIT;
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

# ---- a) texto invalido em integer => 22023 (nao 22P02) ----
a="$(rpc '{"send_interval_min":"abc"}')"
echo "$a" | grep -q 'invalid_talkx_limits_values' || fail "a) 'abc'::integer deveria dar invalid_talkx_limits_values: $a"
echo "$a" | grep -qE '22P02|invalid input syntax' && fail "a) vazou 22P02 (invalid input syntax): $a"

# ---- b) hora invalida em ::time => 22023 (nao 22007/22008) ----
b="$(rpc '{"send_window_start":"25:99:00"}')"
echo "$b" | grep -q 'invalid_talkx_limits_values' || fail "b) '25:99'::time deveria dar invalid_talkx_limits_values: $b"
echo "$b" | grep -qE '2200[78]|date/time field value out of range' && fail "b) vazou 22007/22008 (time): $b"

# ---- b2) sintaxe de hora invalida => 22023 (nao 22007) ----
b2="$(rpc '{"send_window_start":"12345"}')"
echo "$b2" | grep -q 'invalid_talkx_limits_values' || fail "b2) '12345'::time deveria dar invalid_talkx_limits_values: $b2"
echo "$b2" | grep -qE '22007|invalid input syntax for type time' && fail "b2) vazou 22007 (time syntax): $b2"

# ---- c) numero fora do range do integer (teto) => 22023 (nao 22003) ----
c="$(rpc '{"send_interval_max":"99999999999999999999999999"}')"
echo "$c" | grep -q 'invalid_talkx_limits_values' || fail "c) overflow::integer deveria dar invalid_talkx_limits_values: $c"
echo "$c" | grep -qE '22003|value .* is out of range' && fail "c) vazou 22003 (out of range): $c"

# ---- d) business_hours_only '' => ausente (nao vaza; mantem o valor atual) ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits('$camp_id', 1, '{"business_hours_only":""}'::jsonb);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT business_hours_only FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'f' ]] \
  || fail "d) business_hours_only '' deveria ser tratado como ausente (manter false)"

# ---- e) payload valido => grava (regressao) ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits('$camp_id', 2, '{"speed_profile":"fast","business_hours_only":true}'::jsonb);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'fast' ]] \
  || fail 'e) payload valido nao gravou speed_profile=fast'
[[ "$(psql_test -Atqc "SELECT business_hours_only FROM public.talkx_campaigns WHERE id='$camp_id'")" == 't' ]] \
  || fail 'e) payload valido nao gravou business_hours_only=true'

printf '[OK] Talk X V09c: casts endurecidos — texto/hora/overflow viram 22023; business_hours_only "" e ausente.\n'
