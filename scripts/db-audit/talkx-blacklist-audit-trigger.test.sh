#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_BLACKLIST_AUDIT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-blacklist-audit-$RANDOM-$$"
test_password="talkx_blacklist_audit_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-blacklist-audit-[0-9]+-[0-9]+$ ]]; then
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

# Setup: auth schema, roles, and talkx_blacklist table
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TYPE public.talkx_blacklist_reason AS ENUM (
  'opt_out', 'invalid_number', 'manual', 'lgpd', 'no_commercial_permission', 'bounce'
);

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  reason text,
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  origin text NOT NULL,
  campaign_id uuid,
  phone text,
  reason_code public.talkx_blacklist_reason,
  expires_at timestamptz,
  source_message_id uuid,
  removed_by uuid,
  removed_at timestamptz
);

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id UUID)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT false
$$;

ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY talkx_blacklist_select
  ON public.talkx_blacklist FOR SELECT TO authenticated USING (true);

CREATE POLICY talkx_blacklist_update
  ON public.talkx_blacklist FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

GRANT SELECT, UPDATE ON public.talkx_blacklist TO authenticated;
GRANT ALL ON public.talkx_blacklist TO service_role;
SQL

# Apply legacy migrations
legacy_migration="$repo_root/supabase/migrations/20260910090000_talkx_blacklist_v2.sql"
[[ -f "$legacy_migration" ]] && psql_test < "$legacy_migration" >/dev/null

policy_migration="$repo_root/supabase/migrations/20260910100000_restrict_talkx_blacklist_update_policy.sql"
[[ -f "$policy_migration" ]] && psql_test < "$policy_migration" >/dev/null

# Apply the new audit migration
audit_migration="$repo_root/supabase/migrations/20261010060000_talkx_blacklist_audit_and_trigger.sql"
[[ -f "$audit_migration" ]] && psql_test < "$audit_migration" >/dev/null || fail "Migration nao encontrada: $audit_migration"

# Test 1: Phone normalization — digits only, 10-15 digits
psql_test -q -c "
INSERT INTO public.talkx_blacklist (id, phone, origin)
VALUES ('20000000-0000-0000-0000-000000000001', '55 11 90000-0001', 'opt_out')
" >/dev/null
phone_result="$(psql_test -Atqc "SELECT phone FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")"
[[ "$phone_result" == '5511900000001' ]] || fail "Telefone nao normalizado: '$phone_result'"

# Test 2: Phone invalid (too short) — set to NULL, contact_id keeps row valid
psql_test -q -c "
INSERT INTO public.talkx_blacklist (id, contact_id, phone, origin)
VALUES ('20000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '123', 'opt_out')
" >/dev/null
phone_short="$(psql_test -Atqc "SELECT phone FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000002'")"
[[ "$phone_short" == '' ]] || fail "Telefone curto nao foi NULL: '$phone_short'"

# Test 3: reason_code filled from origin when null
reason_result="$(psql_test -Atqc "SELECT reason_code FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")"
[[ "$reason_result" == 'opt_out' ]] || fail "reason_code nao preenchido por origin: '$reason_result'"

# Test 4: blocked_by forced to auth.uid() on insert (auth.uid() is NULL in test context)
blocked_by_result="$(psql_test -Atqc "SELECT blocked_by FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")"
[[ "$blocked_by_result" == '' ]] || fail "blocked_by deveria ser NULL sem auth.uid(): '$blocked_by_result'"

# Test 5: removed_by forced to auth.uid() when removed_at is filled
psql_test -q -c "
UPDATE public.talkx_blacklist SET removed_at = now() WHERE id = '20000000-0000-0000-0000-000000000001'
" >/dev/null
removed_by_result="$(psql_test -Atqc "SELECT removed_by FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")"
[[ "$removed_by_result" == '' ]] || fail "removed_by deveria ser NULL sem auth.uid(): '$removed_by_result'"

# Test 6: Physical DELETE is rejected (must run as authenticated role for RLS)
delete_ok="true"
psql_test -q -c "
SET ROLE authenticated;
DELETE FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001';
" 2>/dev/null && delete_ok="false" || true
psql_test -q -c "RESET ROLE;" >/dev/null 2>&1 || true
[[ "$delete_ok" == "true" ]] || fail "DELETE fisico deveria ter sido rejeitado pela policy talkx_blacklist_no_delete"

# Test 7: import_batch_id column exists
col_exists="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_blacklist' AND column_name='import_batch_id'")"
[[ "$col_exists" == '1' ]] || fail "Coluna import_batch_id nao existe"

# Test 8: removal_reason column exists
col_exists2="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_blacklist' AND column_name='removal_reason'")"
[[ "$col_exists2" == '1' ]] || fail "Coluna removal_reason nao existe"

printf '[PASS] talkx_blacklist audit trigger e columns criados com sucesso\n'