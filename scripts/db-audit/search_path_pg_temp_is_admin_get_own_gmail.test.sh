#!/usr/bin/env bash
# n-148 (SEC-RLS_TAREFAS_EMAIL_LIGACOES-07) — search_path com pg_temp nas duas funcoes
# SECURITY DEFINER que o audit adversarial encontrou com `SET search_path = public`:
# public.is_admin_or_supervisor(uuid) e public.get_own_gmail_accounts().
#
# Roda o MESMO roteiro num PostgreSQL 17 DESCARTAVEL e aplica o ARQUIVO de migration REAL:
#   BLOCO A — estado ANTERIOR (search_path = public, sem pg_temp): registra o defeito
#             (proconfig sem pg_temp) e prova o contrato funcional das duas funcoes
#             rodando como o papel authenticated com request.jwt.claims.
#   BLOCO B — migration aplicada: search_path passa a `public, pg_temp`; o contrato
#             funcional e o ACL nao mudam, e temp tables HOSTIS com os MESMOS nomes que
#             as funcoes resolvem (user_roles, gmail_accounts) NAO shadowam o resultado.
#
# Sem dependencia de banco/stack do cartao: sobe container proprio (roles anon/
# authenticated/service_role sao globais ao cluster — por isso SKIP_DOCKER_SHIM=1).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010150628_search_path_pg_temp_is_admin_get_own_gmail.sql"
postgres_image="${SEARCH_PATH_PG_TEMP_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-search-path-pg-temp-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-search-path-pg-temp-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

-- user_roles: forma minima fiel (so as colunas que is_admin_or_supervisor le).
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- gmail_accounts: forma fiel ao probe-gmail-accounts de producao.
CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sync_status text,
  last_sync_at timestamptz,
  last_error text,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

-- Funcoes SECURITY DEFINER no estado ANTERIOR (search_path = public, SEM pg_temp) —
-- mesmo corpo/assinatura de 20251215025014 (is_admin_or_supervisor) e 20260828210000
-- (get_own_gmail_accounts).
CREATE FUNCTION public.is_admin_or_supervisor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

CREATE FUNCTION public.get_own_gmail_accounts()
RETURNS TABLE(
  id uuid, user_id uuid, email_address text, is_active boolean,
  sync_status text, last_sync_at timestamptz, last_error text,
  token_expires_at timestamptz, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid()
    AND is_active = true;
$function$;

-- ACL canonica das RPCs SECURITY DEFINER: sem EXECUTE para PUBLIC/anon; so authenticated.
REVOKE EXECUTE ON FUNCTION public.is_admin_or_supervisor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_own_gmail_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_gmail_accounts() TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.user_roles (user_id, role)
  VALUES ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.gmail_accounts (id, user_id, email_address, is_active) VALUES
  ('a1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'agente-ativo@exemplo.test', true),
  ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agente-desconectado@exemplo.test', false),
  ('a1000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'de-terceiro@exemplo.test', true);
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ADMIN='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
AGENT='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
ANON='{"sub":"00000000-0000-0000-0000-000000000000","role":"anon"}'

# Roda como authenticated (papel real) com request.jwt.claims, tudo na MESMA sessao.
as_agent() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT" "$1"; }
as_admin() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN" "$1"; }

# Temp tables HOSTIS com os MESMOS NOMES que as funcoes resolvem, tentando escalar/ver
# conta de terceiro. Criadas pelo proprio chamador (authenticated) na mesma sessao.
HOSTIL="CREATE TEMP TABLE user_roles (user_id uuid, role text); \
  INSERT INTO user_roles VALUES ('22222222-2222-2222-2222-222222222222', 'admin'); \
  CREATE TEMP TABLE gmail_accounts (id uuid, user_id uuid, email_address text, is_active boolean); \
  INSERT INTO gmail_accounts VALUES ('deadbeef-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'invasor@exemplo.test', true); \
  SELECT public.is_admin_or_supervisor('22222222-2222-2222-2222-222222222222'::uuid)::text \
       || ',' || (SELECT count(*) FROM public.get_own_gmail_accounts())::text;"

echo '── BLOCO A: estado ANTERIOR (search_path = public, sem pg_temp) — o defeito ───────'

expect_value 'A1 is_admin_or_supervisor esta SEM pg_temp (defeito)' '{search_path=public}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='is_admin_or_supervisor';"
expect_value 'A2 get_own_gmail_accounts esta SEM pg_temp (defeito)' '{search_path=public}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='get_own_gmail_accounts';"

expect_value 'A3 (authenticated) agente comum NAO e admin/supervisor' 'f' \
  "$(as_agent "SELECT public.is_admin_or_supervisor('22222222-2222-2222-2222-222222222222'::uuid);")"
expect_value 'A4 (authenticated) admin e reconhecido' 't' \
  "$(as_admin "SELECT public.is_admin_or_supervisor('11111111-1111-1111-1111-111111111111'::uuid);")"
expect_value 'A5 (authenticated) agente ve SÓ a conta ativa dele (1), nao a de terceiro' '1' \
  "$(as_agent "SELECT count(*) FROM public.get_own_gmail_accounts();")"

expect_value 'A6 temp tables hostis (user_roles/gmail_accounts) NAO escalam nem revelam terceiro' 'false,1' \
  "$(as_agent "$HOSTIL")"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS da migration (search_path = public, pg_temp) ───────────────────'

expect_value 'B1 is_admin_or_supervisor agora tem pg_temp' '{"search_path=public, pg_temp"}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='is_admin_or_supervisor';"
expect_value 'B2 get_own_gmail_accounts agora tem pg_temp' '{"search_path=public, pg_temp"}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='get_own_gmail_accounts';"

expect_value 'B3 (authenticated) agente comum continua NAO admin (contrato preservado)' 'f' \
  "$(as_agent "SELECT public.is_admin_or_supervisor('22222222-2222-2222-2222-222222222222'::uuid);")"
expect_value 'B4 (authenticated) admin continua reconhecido (contrato preservado)' 't' \
  "$(as_admin "SELECT public.is_admin_or_supervisor('11111111-1111-1111-1111-111111111111'::uuid);")"
expect_value 'B5 (authenticated) agente continua vendo SÓ a conta ativa dele (1)' '1' \
  "$(as_agent "SELECT count(*) FROM public.get_own_gmail_accounts();")"

expect_value 'B6 temp tables hostis (user_roles/gmail_accounts) NAO shadowam o resultado' 'false,1' \
  "$(as_agent "$HOSTIL")"

expect_value 'B7 anon NAO executa is_admin_or_supervisor (ACL fechado)' 'f' \
  "SELECT has_function_privilege('anon', 'public.is_admin_or_supervisor(uuid)', 'EXECUTE');"
expect_value 'B8 anon NAO executa get_own_gmail_accounts (ACL fechado)' 'f' \
  "SELECT has_function_privilege('anon', 'public.get_own_gmail_accounts()', 'EXECUTE');"
expect_value 'B9 authenticated executa is_admin_or_supervisor (ACL preservado)' 't' \
  "SELECT has_function_privilege('authenticated', 'public.is_admin_or_supervisor(uuid)', 'EXECUTE');"
expect_value 'B10 authenticated executa get_own_gmail_accounts (ACL preservado)' 't' \
  "SELECT has_function_privilege('authenticated', 'public.get_own_gmail_accounts()', 'EXECUTE');"

printf '\n[OK] search_path com pg_temp em is_admin_or_supervisor e get_own_gmail_accounts (n-148) verificado\n'
