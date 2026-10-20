#!/usr/bin/env bash
# W1 (onda 2) — sonda independente do achado 6:
#   "audit_contact_address_change() nasceu com EXECUTE para PUBLIC e anon"
#
# Reproduz o estado de ALTER DEFAULT PRIVILEGES do Supabase (que da EXECUTE a anon/
# authenticated/service_role em toda funcao nova) e mede a ACL com has_function_privilege.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container_name="zapp-w1-achado6-$$"
cleanup() {
  if [[ "$container_name" =~ ^zapp-w1-achado6-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

image="${W1_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --network none --name "$container_name" \
  -e POSTGRES_PASSWORD=w1_fixture_only "$image" >/dev/null

ready=false
for _ in $(seq 1 45); do
  logs=$(docker logs "$container_name" 2>&1 || true)
  if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
     docker exec "$container_name" psql -X -U postgres -Atc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'FAIL: PostgreSQL de teste não iniciou'; exit 1; }

dbq() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres "$@"; }
apply_file() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres < "$1"; }

# ── fixture + defaults de privilegio do Supabase ─────────────────────────────────────
dbq <<'SQL' >/dev/null
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
-- Mesmo mecanismo do Supabase: funcao nova nasce com EXECUTE para estes papeis.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text, address_number text, neighborhood text, city text, state text, postal_code text,
  latitude double precision, longitude double precision
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, action text NOT NULL, entity_type text, entity_id uuid, details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
SQL

echo "### 1) aplicando supabase/migrations/20260929150000_contact_address_audit_trigger.sql"
apply_file "$repo_root/supabase/migrations/20260929150000_contact_address_audit_trigger.sql"
echo "aplicada (exit 0)"

echo "### 2) proacl cru da funcao"
dbq -c "SELECT p.proname, p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='audit_contact_address_change'"

echo "### 3) has_function_privilege"
for role in anon authenticated service_role; do
  echo -n "$role: "
  dbq -c "SELECT has_function_privilege('$role','public.audit_contact_address_change()','EXECUTE')"
done
echo -n "PUBLIC(via public_): "
dbq -c "SELECT has_function_privilege('public','public.audit_contact_address_change()','EXECUTE')"

echo "### 4) da para CHAMAR a funcao de trigger por RPC (PostgREST usa SELECT ...)?"
set +e
echo "--- como anon ---"
dbq -c "SET ROLE anon; SELECT public.audit_contact_address_change();" 2>&1 | sed 's/^/    /'
echo "--- como authenticated ---"
dbq -c "SET ROLE authenticated; SELECT public.audit_contact_address_change();" 2>&1 | sed 's/^/    /'
set -e

echo "### 5) o trigger funciona normalmente (o EXECUTE do anon nao e o que o dispara)"
dbq -c "INSERT INTO public.contacts (address) VALUES ('Av. Paulista')" >/dev/null
dbq -c "UPDATE public.contacts SET address='Rua Nova'" >/dev/null
echo -n "linhas em audit_logs apos a troca de endereco: "
dbq -c "SELECT count(*) FROM public.audit_logs WHERE action='contact_address_changed'"

echo "### 6) contraste: com a remediacao do proprio repo (REVOKE ... FROM PUBLIC, anon)"
dbq -c "REVOKE EXECUTE ON FUNCTION public.audit_contact_address_change() FROM PUBLIC, anon;" >/dev/null
echo -n "anon depois do REVOKE: "
dbq -c "SELECT has_function_privilege('anon','public.audit_contact_address_change()','EXECUTE')"
echo -n "authenticated depois do REVOKE: "
dbq -c "SELECT has_function_privilege('authenticated','public.audit_contact_address_change()','EXECUTE')"
echo -n "o trigger continua funcionando depois do REVOKE: "
dbq -c "UPDATE public.contacts SET city='São Paulo'" >/dev/null
dbq -c "SELECT count(*) FROM public.audit_logs WHERE action='contact_address_changed'"
