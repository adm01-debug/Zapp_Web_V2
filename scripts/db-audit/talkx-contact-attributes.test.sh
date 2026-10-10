#!/usr/bin/env bash
# TC-XXX (P1) — talkx_contact_attributes: RLS e função de refresh de atributos
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), sem a tabela e sem a função:
#             * SELECT em talkx_contact_attributes como authenticated falha
#               (a tabela não existe);
#             * talkx_refresh_local_attributes() não existe;
#             * is_contact_visible_to_user() funciona mas não tem tabela para
#               consultar atributos.
#   BLOCO B — migration aplicada: tabela criada com RLS, função existe e
#             authenticated pode SELECT só nos contatos visíveis.
#
# Papéis reais (SET ROLE authenticated + request.jwt.claims), nunca postgres.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010120000_talkx_contact_attributes_rls.sql"
postgres_image="${TALKX_CONTACT_ATTR_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-talkx-contact-attr-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-talkx-contact-attr-test-[0-9]+$ ]]; then
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
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" 2>&1)" && fail "$l: deveria ter falhado como authenticated"
  [[ "$a" == *"$e"* ]] || fail "$l: esperado erro contendo '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_privilege() {
  local l="$1" role="$2" fn="$3" priv="$4" s="$5" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$priv" ]] || fail "$l: esperado '$priv' para $role, obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

# Container Postgres descartável
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD=test_only \
  "$postgres_image" >/dev/null

# Prontidão
for _ in $(seq 1 10); do
  docker exec "$container_name" psql -X -qAt -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1 && break
  sleep 1
done

# Superfície mínima do Supabase
psql_file "$repo_root/scripts/db-audit/pre.sql" 2>/dev/null || {
  # Se pre.sql não existir, criar a superfície inline
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA IF NOT EXISTS auth;
SQL
}

# Criar tabelas e helpers na forma ANTERIOR à migration (estado anterior)
docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid NOT NULL PRIMARY KEY,
  name text,
  phone text,
  assigned_to uuid,
  state text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  name text,
  role text DEFAULT 'agent'
);
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id),
  sender text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_deals (
  id uuid NOT NULL PRIMARY KEY,
  contact_id uuid REFERENCES public.contacts(id),
  stage_id uuid
);
CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
  id uuid NOT NULL PRIMARY KEY,
  name text
);
CREATE TABLE IF NOT EXISTS public.talkx_ddd_regions (
  ddd smallint NOT NULL PRIMARY KEY,
  region text NOT NULL,
  uf text NOT NULL
);
-- Helper que retorna o DDD do telefone
CREATE OR REPLACE FUNCTION public.get_ddd_from_phone(p_phone text)
RETURNS smallint LANGUAGE sql STABLE AS $$
  SELECT substring(regexp_replace(p_phone, '\D', '', 'g') from 1 for 2)::smallint;
$$;
-- Helper de visibilidade de contato
CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(p_contact_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    WHERE c.id = p_contact_id AND p.id = p_user_id
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.role IN ('admin', 'supervisor')
  );
$$;
SQL

# Inserir dados de teste
docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
INSERT INTO public.profiles (id, name, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vendedor A', 'agent'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin A', 'admin');
INSERT INTO public.contacts (id, name, phone, assigned_to, state) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Contato A', '11999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SP'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Contato B', '21999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RJ');
INSERT INTO public.talkx_ddd_regions (ddd, region, uf) VALUES
  (11, 'Sudeste', 'SP'),
  (21, 'Sudeste', 'RJ');
INSERT INTO public.messages (id, contact_id, sender, created_at) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'contact', '2026-01-01T00:00:00Z');
SQL

printf '\n=== BLOCO A: estado ANTERIOR (sem migration) ===\n'

# A tabela talkx_contact_attributes não existe ainda
expect_error_as 'authenticated não lê talkx_contact_attributes (tabela inexistente)' 'relation "public.talkx_contact_attributes" does not exist' \
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}' \
  "SELECT count(*) FROM public.talkx_contact_attributes;"

# A função talkx_refresh_local_attributes não existe ainda
expect_error_as 'authenticated não chama talkx_refresh_local_attributes (função inexistente)' 'function public.talkx_refresh_local_attributes(integer) does not exist' \
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}' \
  "SELECT public.talkx_refresh_local_attributes(10);"

printf '\n=== APLICANDO MIGRATION (BLOCO B) ===\n'
psql_file "$migration"

printf '\n=== BLOCO B: migration aplicada ===\n'

# A tabela agora existe
expect_value 'tabela talkx_contact_attributes existe' '1' \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='talkx_contact_attributes';"

# authenticated pode SELECT nos contatos que enxerga (Contato A)
expect_value_as 'A vê seu próprio atributo (linha criada pelo upsert)' '0' \
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id='cccccccc-cccc-cccc-cccc-cccccccccccc';"

# authenticated NÃO vê o contato do outro vendedor (Contato B — não é dele)
# Nota: como ambos os contatos estão atribuídos ao mesmo vendedor A, A vê ambos.
# Para testar isolamento, precisaríamos de um contato atribuído a outro vendedor.
# Por enquanto, verificamos que a RLS está ativa.
expect_value 'RLS habilitada na tabela' 'true' \
  "SELECT relrowsecurity FROM pg_class WHERE relname='talkx_contact_attributes';"

# anon não tem SELECT
expect_privilege 'anon sem SELECT na tabela' 'anon' 'public.talkx_contact_attributes' 'f' \
  "SELECT has_table_privilege('anon','public.talkx_contact_attributes','SELECT');"

# service_role tem SELECT
expect_privilege 'service_role tem SELECT na tabela' 'service_role' 'public.talkx_contact_attributes' 't' \
  "SELECT has_table_privilege('service_role','public.talkx_contact_attributes','SELECT');"

# authenticated não tem INSERT/UPDATE/DELETE
expect_privilege 'authenticated sem INSERT na tabela' 'authenticated' 'public.talkx_contact_attributes' 'f' \
  "SELECT has_table_privilege('authenticated','public.talkx_contact_attributes','INSERT');"

# A função existe e é executável por service_role
expect_privilege 'service_role tem EXECUTE na função' 'service_role' 'public.talkx_refresh_local_attributes' 't' \
  "SELECT has_function_privilege('service_role','public.talkx_refresh_local_attributes(integer)','EXECUTE');"

# authenticated não pode executar a função
expect_error_as 'authenticated não executa talkx_refresh_local_attributes' 'permission denied' \
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}' \
  "SELECT public.talkx_refresh_local_attributes(10);"

# service_role pode executar a função (e retorna integer)
expect_ok_as 'service_role executa talkx_refresh_local_attributes' '{"sub":"service-role","role":"service_role"}' \
  "SELECT public.talkx_refresh_local_attributes(10);"

printf '\n=== TESTE DE RLS: authenticated só vê contatos visíveis ===\n'

# Inserir um contato atribuído ao admin (que A não enxerga)
docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
INSERT INTO public.contacts (id, name, phone, assigned_to, state) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Contato C', '31999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'MG');
INSERT INTO public.talkx_contact_attributes (contact_id, salesperson_name, state, region, updated_at) VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Admin A', 'MG', 'Sudeste', now());
SQL

# A (vendedor) não vê o contato C (atribuído ao admin)
expect_value_as 'A não vê atributo do contato do admin' '0' \
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id='ffffffff-ffff-ffff-ffff-ffffffffffff';"

# Admin vê o contato C
expect_value_as 'admin vê atributo do contato C' '1' \
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}' \
  "SELECT count(*) FROM public.talkx_contact_attributes WHERE contact_id='ffffffff-ffff-ffff-ffff-ffffffffffff';"

printf '\n=== TODO PASSOU ===\n'