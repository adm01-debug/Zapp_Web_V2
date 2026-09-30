#!/usr/bin/env bash
set -Eeuo pipefail

# V09 do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 (P1-3): "Editar limites" via RPC.
#
# Prova, em PostgreSQL 17 descartável, que:
#  1) o trigger enforce_talkx_campaign_mutability CONTINUA negando o update direto
#     de limites numa campanha `sending` (status fora de draft/scheduled);
#  2) a RPC update_talkx_campaign_limits (SECURITY DEFINER + escape hatch
#     `app.talkx_limits_write`) consegue gravar os limites em `sending`;
#  3) o hatch é transacional: depois da RPC, o update direto volta a ser negado;
#  4) revisão otimista, ownership e validação de whitelist/faixas funcionam.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_UPDATE_LIMITS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-update-limits-$RANDOM-$$"
test_password="talkx_update_limits_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-update-limits-[0-9]+-[0-9]+$ ]]; then
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
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'agent'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin'),
  ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', 'agent');

GRANT SELECT, UPDATE ON public.talkx_campaigns TO authenticated;
SQL

# ---- aplica a migration (funcao do trigger + RPC); replayavel ----
migration="$repo_root/supabase/migrations/20260930180000_talkx_update_campaign_limits_rpc.sql"
[[ -f "$migration" ]] || fail 'migration da V09 nao existe'
psql_test < "$migration" >/dev/null || fail 'V09 nao aplicou'
psql_test < "$migration" >/dev/null || fail 'V09 nao e replayavel (segunda aplicacao falhou)'

# ---- trigger vivo (BEFORE INSERT OR UPDATE OR DELETE) ----
psql_test -q -c 'CREATE TRIGGER enforce_talkx_campaign_mutability BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();' >/dev/null

# ---- campanha `sending` de fixture (o trigger de INSERT nao barra service_role) ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.talkx_campaigns(id, status, created_by, total_recipients, revision)
VALUES ('30000000-0000-0000-0000-000000000001', 'sending', '10000000-0000-0000-0000-000000000001', 5, 1);
COMMIT;
SQL

# ---- 1) update DIRETO de limites em `sending` continua negado (status fora de draft/scheduled) ----
err_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.talkx_campaigns SET speed_profile = 'fast' WHERE id = '30000000-0000-0000-0000-000000000001';
COMMIT;
SQL
)"
echo "$err_out" | grep -q 'talkx_campaign_transition_denied' \
  || fail "update direto de limites em sending NAO foi negado pelo trigger (esperava transition_denied): $err_out"

# ---- 2) RPC como dono grava limites em `sending` (o caso do aceite) ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 1,
  '{"speed_profile":"fast","send_interval_min":5000,"send_interval_max":9000,"business_hours_only":true}'::jsonb
);
COMMIT;
SQL

[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == 'fast' ]] \
  || fail 'RPC nao gravou speed_profile=fast em campanha sending'
[[ "$(psql_test -Atqc "SELECT send_interval_min || ':' || send_interval_max FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == '5000:9000' ]] \
  || fail 'RPC nao gravou os intervalos'
[[ "$(psql_test -Atqc "SELECT revision FROM public.talkx_campaigns WHERE id='30000000-0000-0000-0000-000000000001'")" == '2' ]] \
  || fail 'RPC nao incrementou a revision (esperava 2)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='30000000-0000-0000-0000-000000000001' AND event_type='limits_updated'")" == '1' ]] \
  || fail 'RPC nao gravou o evento limits_updated'
[[ "$(psql_test -Atqc "SELECT message::jsonb->'before'->>'speed_profile' FROM public.talkx_campaign_events WHERE campaign_id='30000000-0000-0000-0000-000000000001' AND event_type='limits_updated'")" == 'moderate' ]] \
  || fail 'evento limits_updated sem o diff (before.speed_profile deveria ser moderate)'

# ---- 3) hatch e transacional: update direto volta a ser negado DEPOIS da RPC ----
err_out2="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.talkx_campaigns SET speed_profile = 'slow' WHERE id = '30000000-0000-0000-0000-000000000001';
COMMIT;
SQL
)"
echo "$err_out2" | grep -q 'talkx_campaign_transition_denied' \
  || fail "update direto DEPOIS da RPC nao foi negado (o hatch vazou da transacao): $err_out2"

# ---- 4) revisao otimista: revision esperada defasada e recusada ----
stale_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 1,
  '{"speed_profile":"moderate"}'::jsonb
);
COMMIT;
SQL
)"
echo "$stale_out" | grep -q 'talkx_campaign_stale_revision' \
  || fail "revision defasada nao foi recusada (esperava stale_revision): $stale_out"

# ---- 5) ownership: agente que nao e dono nem supervisor e recusado ----
notowner_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 2,
  '{"speed_profile":"fast"}'::jsonb
);
COMMIT;
SQL
)"
echo "$notowner_out" | grep -q 'talkx_campaign_not_authorized' \
  || fail "nao-dono nao foi recusado (esperava not_authorized): $notowner_out"

# ---- 6) validacao de faixa: min > max e recusado ----
range_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 2,
  '{"send_interval_min":9000,"send_interval_max":5000}'::jsonb
);
COMMIT;
SQL
)"
echo "$range_out" | grep -q 'invalid_talkx_limits_values' \
  || fail "min>max nao foi recusado (esperava invalid_talkx_limits_values): $range_out"

# ---- 7) whitelist: chave fora da lista e recusada ----
field_out="$(psql_test 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits(
  '30000000-0000-0000-0000-000000000001', 2,
  '{"status":"cancelled"}'::jsonb
);
COMMIT;
SQL
)"
echo "$field_out" | grep -q 'invalid_talkx_limits_field' \
  || fail "chave fora da whitelist nao foi recusada (esperava invalid_talkx_limits_field): $field_out"

# ---- ACL: authenticated pode executar, anon NAO ----
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.update_talkx_campaign_limits(uuid,bigint,jsonb)','EXECUTE')")" == 't' ]] \
  || fail 'authenticated deveria ter EXECUTE na RPC da V09'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','public.update_talkx_campaign_limits(uuid,bigint,jsonb)','EXECUTE')")" == 'f' ]] \
  || fail 'anon NAO deveria ter EXECUTE na RPC da V09'

printf '[OK] Talk X V09: limites de campanha sending so mudam pela RPC (hatch transacional); revisao, ownership, whitelist e faixas validados.\n'
