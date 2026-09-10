#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_BLACKLIST_POLICY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-blacklist-policy-$RANDOM-$$"
test_password="talkx_blacklist_policy_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-blacklist-policy-[0-9]+-[0-9]+$ ]]; then
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

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL
);
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY,
  marker text NOT NULL DEFAULT 'original',
  removed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  removed_at timestamptz,
  origin text NOT NULL DEFAULT 'manual'
);
ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.talkx_blacklist TO authenticated;
CREATE POLICY talkx_blacklist_select
  ON public.talkx_blacklist FOR SELECT TO authenticated USING (true);

CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.profiles WHERE id = p_user AND role IN ('admin', 'supervisor')
) $$;

INSERT INTO public.profiles(id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'agent'),
  ('10000000-0000-0000-0000-000000000002', 'admin');
INSERT INTO public.talkx_blacklist(id) VALUES ('20000000-0000-0000-0000-000000000001');
SQL

legacy_migration="$repo_root/supabase/migrations/20260910080000_talkx_blacklist_audit.sql"
forward_migration="$repo_root/supabase/migrations/20260910100000_restrict_talkx_blacklist_update_policy.sql"
runtime_contract="$repo_root/scripts/db-audit/talkx-blacklist-policy-runtime.sql"
psql_test < "$legacy_migration" >/dev/null

legacy_policy="$(psql_test -Atqc "SELECT pg_get_expr(polqual, polrelid) || '|' || pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polname='talkx_blacklist_update' AND polrelid='public.talkx_blacklist'::regclass")"
[[ "$legacy_policy" == 'true|true' ]] || fail "migration historica nao preservou policy aplicada: $legacy_policy"

legacy_runtime="$(psql_test -At < "$runtime_contract")"
PROOF="$legacy_runtime" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.PROOF);
if (proof.relation_count !== 1 || proof.rls_enabled !== true || proof.policy_count !== 1
  || proof.legacy_permissive_count !== 1 || proof.restricted_policy_count !== 0) {
  process.exit(1);
}
NODE

psql_test < "$forward_migration" >/dev/null
psql_test < "$forward_migration" >/dev/null

policy="$(psql_test -Atqc "SELECT pg_get_expr(polqual, polrelid) || '|' || pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polname='talkx_blacklist_update' AND polrelid='public.talkx_blacklist'::regclass")"
[[ "$policy" == *'is_admin_or_supervisor(auth.uid())'*'|'*'is_admin_or_supervisor(auth.uid())'* ]] \
  || fail "policy final nao restringe admin/supervisor: $policy"

restricted_runtime="$(psql_test -At < "$runtime_contract")"
PROOF="$restricted_runtime" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.PROOF);
if (proof.relation_count !== 1 || proof.rls_enabled !== true || proof.policy_count !== 1
  || proof.authenticated_policy_count !== 1 || proof.legacy_permissive_count !== 0
  || proof.restricted_policy_count !== 1 || !/^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')) {
  process.exit(1);
}
NODE

psql_test -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
UPDATE public.talkx_blacklist SET marker = 'agent'
WHERE id = '20000000-0000-0000-0000-000000000001';
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT marker FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")" == 'original' ]] \
  || fail 'tentativa do agente alterou blacklist'

psql_test -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
UPDATE public.talkx_blacklist SET marker = 'admin'
WHERE id = '20000000-0000-0000-0000-000000000001';
COMMIT;
SQL
[[ "$(psql_test -Atqc "SELECT marker FROM public.talkx_blacklist WHERE id = '20000000-0000-0000-0000-000000000001'")" == 'admin' ]] \
  || fail 'atualizacao do admin nao persistiu'

printf '[OK] Talk X blacklist: ledger historico preservado e policy restrita por migration forward-only.\n'
