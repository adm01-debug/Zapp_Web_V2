#!/usr/bin/env bash
# Harness descartável: V15 — replied_count protegido pelo guard + increment_talkx_template_use removida.
# Prova: (1) UPDATE direto de replied_count como authenticated → erro 42501;
#        (2) a RPC increment_talkx_template_use não existe mais (DROP).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v15_test_only'
cid="talkx-v15-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-v15-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" postgres:17-alpine >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos: auth, profiles, campanhas ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true
);

CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
SQL

# ---- RED: sem a migration V15, replied_count é editável por authenticated ----
psql_test >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.enforce_talkx_campaign_mutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $f$
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NEW.sent_count IS DISTINCT FROM OLD.sent_count
     OR NEW.delivered_count IS DISTINCT FROM OLD.delivered_count THEN
    RAISE EXCEPTION 'talkx_delivery_state_managed_by_worker' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$f$;
CREATE TRIGGER enforce_talkx_campaign_mutability
BEFORE UPDATE ON public.talkx_campaigns
FOR EACH ROW EXECUTE FUNCTION public.enforce_talkx_campaign_mutability();
SQL

psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, status, total_recipients)
  VALUES ('20000000-0000-0000-0000-000000000001', 'draft', 1);
SQL

# RED: replied_count NÃO é protegido pela versão antiga do guard
red_err="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; UPDATE public.talkx_campaigns SET replied_count = replied_count + 1 WHERE id='20000000-0000-0000-0000-000000000001'; COMMIT;" 2>&1 || true)"
if [[ "$red_err" == *'talkx_delivery_state_managed_by_worker'* ]]; then
  fail "RED: replied_count ja era protegido antes da V15 (got $red_err)"
fi
psql_test -Atqc "UPDATE public.talkx_campaigns SET replied_count = 0 WHERE id='20000000-0000-0000-0000-000000000001'" >/dev/null

# ---- GREEN: migration V15 protege replied_count + dropa a RPC ----
psql_test < "$repo_root/supabase/migrations/20260930710000_talkx_v15_replied_count_guard_and_drop_increment.sql" >/dev/null \
  || fail 'migration V15 nao aplicou (GREEN)'

green_err="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; UPDATE public.talkx_campaigns SET replied_count = replied_count + 1 WHERE id='20000000-0000-0000-0000-000000000001'; COMMIT;" 2>&1 || true)"
[[ "$green_err" == *'talkx_delivery_state_managed_by_worker'* ]] \
  || fail "GREEN: replied_count nao foi protegido (got $green_err)"

rpc_exists="$(psql_test -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='increment_talkx_template_use'")"
[[ "$rpc_exists" == '0' ]] || fail "GREEN: increment_talkx_template_use ainda existe (count=$rpc_exists)"

echo '[OK] Talk X V15: replied_count protegido pelo guard + increment_talkx_template_use removida.'
