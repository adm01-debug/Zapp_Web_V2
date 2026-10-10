#!/usr/bin/env bash
# W1 (onda 2) — sonda independente do achado 1:
#   "20260929370000 reemite search_contacts sem os 6 campos de endereco => replay em ordem aborta 42P13"
#
# Cadeia minima: fixture + a migration IRMA (20260929140000, 23 colunas) + a 20260929370000.
# Nenhuma credencial de producao; Postgres descartavel.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container_name="zapp-w1-achado1-$$"
cleanup() {
  if [[ "$container_name" =~ ^zapp-w1-achado1-[0-9]+$ ]]; then
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

# ── fixture minima (mesma classe da usada pelo teste do proprio repo) ─────────────────
dbq <<'SQL' >/dev/null
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.is_admin_or_supervisor(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.get_visible_agent_ids(u uuid) RETURNS setof uuid LANGUAGE sql STABLE AS $$ SELECT u $$;
CREATE FUNCTION public.get_profile_id_for_user(u uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT u $$;
CREATE TABLE public.queue_members (queue_id uuid, profile_id uuid, is_active boolean);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, nickname text, surname text, job_title text, company text, phone text,
  email text, avatar_url text, tags text[], notes text, contact_type text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision, longitude double precision,
  address text, address_number text, neighborhood text, city text, state text, postal_code text,
  assigned_to uuid, queue_id uuid
);
SQL

echo "### 1) estado inicial: search_contacts nao existe"
dbq -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='search_contacts'"

echo "### 2) aplicando 20260929140000_search_contacts_returns_address.sql (a migration irma da F1)"
apply_file "$repo_root/supabase/migrations/20260929140000_search_contacts_returns_address.sql"
echo "resultado: $(dbq -c "SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='search_contacts'" | tr -d '\n')"

echo "### 3) replay em ordem: aplicando 20260929370000_contacts_soft_delete_and_search_filters.sql"
set +e
saida=$(docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -U postgres \
  < "$repo_root/supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql" 2>&1)
code=$?
set -e
echo "exit_code=$code"
printf '%s\n' "$saida"

echo "### 4) assinatura depois da tentativa (a antiga continua de pe?)"
dbq -c "SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='search_contacts'"
echo "### 5) colunas de saida declaradas POR search_contacts em cada arquivo"
echo -n "20260929370000: "
grep -o 'RETURNS TABLE(id uuid[^)]*)' "$repo_root/supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql" | tr ',' '\n' | wc -l
echo -n "20260929140000: "
grep -o 'RETURNS TABLE(id uuid[^)]*)' "$repo_root/supabase/migrations/20260929140000_search_contacts_returns_address.sql" | tr ',' '\n' | wc -l
echo "### 6) a 20260929370000 cita as 6 colunas de endereco em algum lugar?"
grep -c 'address_number\|neighborhood\|postal_code' "$repo_root/supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql"
