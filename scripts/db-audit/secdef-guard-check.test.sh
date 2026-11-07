#!/usr/bin/env bash
# Contrato de segurança: update_agent_streak e increment_agent_resolutions devem
# usar o guard canônico (auth.role() = 'anon' OR (auth.uid() IS NOT NULL AND NOT ...))
# e NÃO o guard quebrado (auth.role() = 'authenticated' AND NOT ...) que bloqueia
# service_role, cujo uid é null.
#
# Roda em PostgreSQL 17 descartável. Nenhuma credencial de produção entra aqui.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261107153000_fix_gamification_streak_resolutions_guard.sql"
postgres_image="${SECDEF_GUARD_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-secdef-guard-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-secdef-guard-test.XXXXXX)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-secdef-guard-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    /tmp/zapp-v2-secdef-guard-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "Migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Stubs de auth.role() e auth.uid() idênticos ao Supabase
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.agent_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE,
  current_streak int NOT NULL DEFAULT 0,
  best_streak int NOT NULL DEFAULT 0,
  last_active_date date,
  conversations_resolved int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT false $$;

CREATE FUNCTION public.register_agent_active_day(p_profile_id uuid, p_today date)
  RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT NULL::json $$;

-- Dados de fixture
INSERT INTO public.profiles VALUES ('aaaa0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001');
INSERT INTO public.agent_stats (profile_id) VALUES ('aaaa0000-0000-0000-0000-000000000001');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# Aplica a migration real do repo
psql_file "$migration" >/dev/null

# ── 1. Verificação estática: guard canônico presente, guard quebrado ausente ────────────
expect_value 'update_agent_streak: guard canonico (anon OR uid IS NOT NULL) presente' 'true' \
  "SELECT pg_get_functiondef('public.update_agent_streak(uuid,boolean)'::regprocedure) ILIKE '%auth.role() = ''anon''%'"

expect_value 'update_agent_streak: guard quebrado (authenticated AND NOT) ausente' 'false' \
  "SELECT pg_get_functiondef('public.update_agent_streak(uuid,boolean)'::regprocedure) ILIKE '%auth.role() = ''authenticated'' AND NOT%'"

expect_value 'increment_agent_resolutions: guard canonico (anon OR uid IS NOT NULL) presente' 'true' \
  "SELECT pg_get_functiondef('public.increment_agent_resolutions(uuid)'::regprocedure) ILIKE '%auth.role() = ''anon''%'"

expect_value 'increment_agent_resolutions: guard quebrado (authenticated AND NOT) ausente' 'false' \
  "SELECT pg_get_functiondef('public.increment_agent_resolutions(uuid)'::regprocedure) ILIKE '%auth.role() = ''authenticated'' AND NOT%'"

# ── 2. Verificação de runtime: service_role (uid=null) passa o guard ─────────────────────
#    auth.role() = 'anon' → false; auth.uid() IS NOT NULL → false → guard nao dispara
PROFILE='aaaa0000-0000-0000-0000-000000000001'

svc_result="$(psql_sql "SELECT public.increment_agent_resolutions('$PROFILE'::uuid)")"
[[ "$svc_result" == '{"newResolutions":1}' ]] || fail "service_role sem claims deveria retornar newResolutions:1, obteve: $svc_result"
printf '[PASS] service_role (uid=null, sem claims) executa increment_agent_resolutions sem erro\n'

# ── 3. Verificação de runtime: anon recebe permission denied ─────────────────────────────
#    auth.role() = 'anon' → true → guard dispara imediatamente
anon_result="$(psql_sql "SET request.jwt.claim.role='anon'; SELECT public.increment_agent_resolutions('$PROFILE'::uuid)" 2>&1 || true)"
if echo "$anon_result" | grep -qi 'permission denied'; then
  printf '[PASS] anon recebe permission denied ao chamar increment_agent_resolutions\n'
else
  fail "anon deveria receber 'permission denied', obteve: $anon_result"
fi

# ── 4. Verificação de runtime: authenticated com profile próprio passa ───────────────────
OWNER_UID='bbbb0000-0000-0000-0000-000000000001'
auth_result="$(psql_sql "SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$OWNER_UID'; SELECT public.increment_agent_resolutions('$PROFILE'::uuid)")"
[[ "$auth_result" == '{"newResolutions":2}' ]] || fail "authenticated com profile proprio deveria retornar newResolutions:2, obteve: $auth_result"
printf '[PASS] authenticated (uid=%s, profile proprio) executa sem erro\n' "$OWNER_UID"

# ── 5. Verificação de runtime: authenticated com profile alheio recebe permission denied ─
OTHER_UID='cccc0000-0000-0000-0000-000000000001'
other_result="$(psql_sql "SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$OTHER_UID'; SELECT public.increment_agent_resolutions('$PROFILE'::uuid)" 2>&1 || true)"
if echo "$other_result" | grep -qi 'permission denied'; then
  printf '[PASS] authenticated com profile alheio recebe permission denied\n'
else
  fail "authenticated com profile alheio deveria receber 'permission denied', obteve: $other_result"
fi

printf 'OK: guard canonico verificado em update_agent_streak e increment_agent_resolutions\n'
