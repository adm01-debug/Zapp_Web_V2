#!/usr/bin/env bash
set -Eeuo pipefail

# V09d do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 — fecha o GAP do escape hatch
# `app.talkx_limits_write` (achado #6 da auditoria adversarial, red-team).
#
# Prova, em PostgreSQL 17 descartável, que o trigger enforce_talkx_campaign_mutability
# NÃO libera a edição de limites só porque o GUC está ligado — exige que o chamador
# seja o dono da campanha (perfil ativo) ou admin/supervisor:
#   a) não-dono com o GUC ligado  -> negado (talkx_campaign_not_authorized);
#   b) dono com o GUC ligado      -> permitido (muda só limites);
#   c) admin com o GUC ligado     -> permitido;
#   d) RPC (dono)                 -> continua funcionando (regressão).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_ESCAPE_HATCH_AUTH_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-escape-hatch-auth-$RANDOM-$$"
test_password="talkx_escape_hatch_auth_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-escape-hatch-auth-[0-9]+-[0-9]+$ ]]; then
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
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'agent'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin'),
  ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', 'agent');
GRANT SELECT, UPDATE ON public.talkx_campaigns TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
SQL

# ---- aplica V09 (trigger antigo + RPC) + V09d (trigger endurecido); replayavel ----
v09="$repo_root/supabase/migrations/20260930180000_talkx_update_campaign_limits_rpc.sql"
v09d="$repo_root/supabase/migrations/20260930360000_talkx_enforce_mutability_auth.sql"
[[ -f "$v09" ]] || fail 'migration da V09 nao existe'
[[ -f "$v09d" ]] || fail 'migration da V09d nao existe'
psql_test < "$v09" >/dev/null || fail 'V09 nao aplicou'
psql_test < "$v09d" >/dev/null || fail 'V09d nao aplicou'
psql_test < "$v09d" >/dev/null || fail 'V09d nao e replayavel (segunda aplicacao falhou)'

# ---- trigger vivo ----
psql_test -q -c 'CREATE TRIGGER enforce_talkx_campaign_mutability BEFORE INSERT OR UPDATE OR DELETE ON public.talkx_campaigns FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();' >/dev/null

# ---- campanha `sending` do dono (agente 001) ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
INSERT INTO public.talkx_campaigns(id, status, created_by, total_recipients, revision)
VALUES ('30000000-0000-0000-0000-000000000001', 'sending', '10000000-0000-0000-0000-000000000001', 5, 1);
COMMIT;
SQL

camp_id='30000000-0000-0000-0000-000000000001'

# ---- a) nao-dono (agente 003) com GUC ligado => negado (not_authorized) ----
a="$(psql_test 2>&1 <<SQL || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
SET LOCAL app.talkx_limits_write = 'on';
UPDATE public.talkx_campaigns SET speed_profile = 'fast' WHERE id = '$camp_id';
COMMIT;
SQL
)"
echo "$a" | grep -q 'talkx_campaign_not_authorized' \
  || fail "a) nao-dono com GUC ligado NAO foi negado (esperava not_authorized): $a"

# ---- b) dono (agente 001) com GUC ligado => permitido (muda só limites) ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET LOCAL app.talkx_limits_write = 'on';
UPDATE public.talkx_campaigns SET speed_profile = 'fast' WHERE id = '$camp_id';
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'fast' ]] \
  || fail 'b) dono com GUC ligado nao conseguiu mudar speed_profile'

# ---- c) admin (agente 002) com GUC ligado => permitido ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
SET LOCAL app.talkx_limits_write = 'on';
UPDATE public.talkx_campaigns SET speed_profile = 'slow' WHERE id = '$camp_id';
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'slow' ]] \
  || fail 'c) admin com GUC ligado nao conseguiu mudar speed_profile'

# ---- d) RPC como dono continua funcionando (regressão) ----
psql_test -q <<SQL >/dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT * FROM public.update_talkx_campaign_limits('$camp_id', 1, '{"speed_profile":"moderate"}'::jsonb);
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT speed_profile FROM public.talkx_campaigns WHERE id='$camp_id'")" == 'moderate' ]] \
  || fail 'd) RPC (dono) nao gravou via escape hatch sancionado'

printf '[OK] Talk X V09d: escape hatch exige dono/admin — GUC sozinho nao libera edicao de limites.\n'
