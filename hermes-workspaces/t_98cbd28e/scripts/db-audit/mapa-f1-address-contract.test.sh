#!/usr/bin/env bash
# Contrato da Fase 1 (E02 + E06) em PostgreSQL descartável.
#
# Prova, com a fixture mínima que o módulo precisa, que:
#   1. `search_contacts` volta a existir com os 6 campos de endereço, na ordem depois de
#      longitude e antes de total_count (é a assinatura que o front consome);
#   2. uma linha com endereço atravessa a RPC;
#   3. o ACL restaurado não deixa PUBLIC/anon executarem a função;
#   4. o trigger `trg_audit_contact_address_change` só grava em `audit_logs` quando o
#      endereço MUDA, e marca `cleared=true` quando o endereço é esvaziado.
#
# Uso: bash scripts/db-audit/retry-disposable-postgres-test.sh \
#        bash scripts/db-audit/mapa-f1-address-contract.test.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container_name="zapp-mapa-f1-test-$$"
test_dir=$(mktemp -d)

cleanup() {
  if [[ "$container_name" =~ ^zapp-mapa-f1-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  rm -rf "$test_dir"
}
trap cleanup EXIT

image="${MAPA_F1_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --network none --name "$container_name" \
  -e POSTGRES_PASSWORD=mapa_f1_fixture_only "$image" >/dev/null

ready=false
for _ in $(seq 1 45); do
  logs=$(docker logs "$container_name" 2>&1 || true)
  if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
    docker exec "$container_name" psql -X -U postgres -Atc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'FAIL: PostgreSQL de teste não iniciou'; exit 1; }

db() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres "$@"; }
apply() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres < "$1" >/dev/null; }
fail() { echo "FAIL: $1"; exit 1; }

# ── fixture mínima: papéis, auth.uid() e as tabelas/funções que a RPC usa ────────────
db <<'SQL' >/dev/null
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT '00000000-0000-0000-0000-0000000000a1'::uuid $$;
CREATE FUNCTION public.is_admin_or_supervisor(u uuid) RETURNS boolean LANGUAGE sql STABLE
  AS $$ SELECT true $$;
CREATE FUNCTION public.get_visible_agent_ids(u uuid) RETURNS setof uuid LANGUAGE sql STABLE
  AS $$ SELECT u $$;
CREATE FUNCTION public.get_profile_id_for_user(u uuid) RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT u $$;
CREATE TABLE public.queue_members (queue_id uuid, profile_id uuid, is_active boolean);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, nickname text, surname text, job_title text, company text, phone text,
  email text, avatar_url text, tags text[], notes text, contact_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision, longitude double precision,
  address text, address_number text, neighborhood text, city text, state text, postal_code text,
  assigned_to uuid, queue_id uuid
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, action text NOT NULL, entity_type text, entity_id uuid, details jsonb,
  ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now()
);
SQL

apply "$repo_root/supabase/migrations/20260929140000_search_contacts_returns_address.sql"
apply "$repo_root/supabase/migrations/20260929150000_contact_address_audit_trigger.sql"

# ── 1. assinatura do RETURNS TABLE (presença e ordem) ───────────────────────────────
# `regclass` não resolve o rowtype da função no PG descartável; a fonte autoritativa aqui
# é `pg_get_function_result`, que devolve o texto exato do RETURNS TABLE.
sig=$(db -c "SELECT pg_get_function_result(p.oid)
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='search_contacts'")
expected_tail='latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)'
[[ "$sig" == *"$expected_tail" ]] || fail "RETURNS TABLE sem os 6 campos de endereço na ordem esperada: $sig"

# ── 2. uma linha com endereço atravessa a RPC ──────────────────────────────────────
db -c "INSERT INTO public.contacts (name, phone, address, address_number, neighborhood, city, state, postal_code, latitude, longitude)
       VALUES ('Contrato F1', '5511900000000', 'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP', '01310100', -23.5613, -46.6565)" >/dev/null
row=$(db -c "SELECT address || '|' || city || '|' || state || '|' || latitude::text FROM public.search_contacts('Contrato F1')")
[[ "$row" == 'Av. Paulista|São Paulo|SP|-23.5613' ]] || fail "RPC não devolveu o endereço da linha: '$row'"

# ── 3. ACL: PUBLIC/anon fora, authenticated dentro ─────────────────────────────────
grants=$(db -c "SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee)
                FROM information_schema.routine_privileges
                WHERE routine_schema='public' AND routine_name='search_contacts'")
[[ "$grants" != *anon* ]] || fail "anon ainda executa search_contacts (ACL não restaurado): $grants"
[[ "$grants" == *authenticated* ]] || fail "authenticated perdeu o EXECUTE de search_contacts: $grants"

# ── 4. trigger de auditoria: só em mudança, com cleared correto ───────────────────
contact_id=$(db -c "SELECT id FROM public.contacts WHERE name='Contrato F1' LIMIT 1")

db -c "UPDATE public.contacts SET name='Contrato F1 renomeado' WHERE id='$contact_id'" >/dev/null
n=$(db -c "SELECT count(*) FROM public.audit_logs WHERE action='contact_address_changed'")
[[ "$n" == "0" ]] || fail "trigger gravou auditoria sem o endereço mudar ($n linhas)"

db -c "UPDATE public.contacts SET address='Rua Nova' WHERE id='$contact_id'" >/dev/null
n=$(db -c "SELECT count(*) FROM public.audit_logs WHERE action='contact_address_changed'")
[[ "$n" == "1" ]] || fail "trigger não gravou a mudança de endereço ($n linhas)"

cleared=$(db -c "SELECT (details->>'cleared')::boolean FROM public.audit_logs WHERE action='contact_address_changed' ORDER BY created_at DESC LIMIT 1")
[[ "$cleared" == "f" ]] || fail "cleared deveria ser false numa troca de endereço: $cleared"

db -c "UPDATE public.contacts SET address=NULL, city=NULL, latitude=NULL, longitude=NULL WHERE id='$contact_id'" >/dev/null
cleared=$(db -c "SELECT (details->>'cleared')::boolean FROM public.audit_logs WHERE action='contact_address_changed' ORDER BY created_at DESC LIMIT 1")
[[ "$cleared" == "t" ]] || fail "cleared deveria ser true ao esvaziar o endereço: $cleared"

pii=$(db -c "SELECT count(*) FROM public.audit_logs WHERE action='contact_address_changed' AND (details::text LIKE '%Paulista%' OR details::text LIKE '%Rua Nova%')")
[[ "$pii" == "0" ]] || fail "audit_logs guardou o endereço em texto claro ($pii linhas)"

echo "OK: search_contacts com os 6 campos de endereço, ACL restaurado e trigger de auditoria só em mudança"
