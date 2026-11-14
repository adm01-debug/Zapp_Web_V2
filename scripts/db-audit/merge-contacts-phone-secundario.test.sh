#!/usr/bin/env bash
# QA-sweep (BUG HIGH): prova, num PostgreSQL descartavel, que
# public.merge_contacts_atomic trava com 23505 (unique_violation) quando o
# telefone escolhido em p_merged_fields e o telefone do contato SECUNDARIO --
# na versao viva criada por 20261006205100_contact_notes_identity_merge_bypass.sql
# -- e que a migration 20261114120500_merge_contacts_phone_secundario_unique.sql
# corrige isso sem mudar nenhum outro comportamento (campos, privilegio, guard
# de notas, contagem de relacoes movidas).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_bug="$repo_root/supabase/migrations/20261006205100_contact_notes_identity_merge_bypass.sql"
migration_fix="$repo_root/supabase/migrations/20261114120500_merge_contacts_phone_secundario_unique.sql"
container_name="zapp-v2-merge-phone-test-$$"
postgres_image="${MERGE_PHONE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-merge-phone-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

wait_for_postgres() {
  local attempt logs
  for attempt in $(seq 1 60); do
    logs="$(docker logs "$container_name" 2>&1 || true)"
    if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
      docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

expect_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  ((passed += 1))
  printf '[PASS] %s\n' "$label"
}

[[ -f "$migration_bug" ]] || fail "migration com o defeito nao encontrada: $migration_bug"
[[ -f "$migration_fix" ]] || fail "migration de correcao nao encontrada: $migration_fix"

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=merge_phone_test_only "$postgres_image" >/dev/null
wait_for_postgres || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# Esqueleto minimo do contrato real: roles do Supabase, auth.role()/auth.uid(),
# is_admin_or_supervisor, e as tabelas tocadas pela funcao com as MESMAS
# constraints de contacts medidas em produzido (contacts_phone_key UNIQUE NOT
# DEFERRABLE + contacts_phone_not_empty CHECK).
psql_sql "
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS \$\$ SELECT 'service_role'::text \$\$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS \$\$ SELECT NULL::uuid \$\$;
  CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean LANGUAGE sql AS \$\$ SELECT true \$\$;
  CREATE TABLE public.contacts (
    id uuid PRIMARY KEY,
    name text, surname text, nickname text, phone text, email text,
    company text, job_title text, contact_type text, avatar_url text,
    tags text[], updated_at timestamptz DEFAULT now()
  );
  ALTER TABLE public.contacts ADD CONSTRAINT contacts_phone_key UNIQUE (phone);
  ALTER TABLE public.contacts ADD CONSTRAINT contacts_phone_not_empty CHECK (length(btrim(phone)) > 0);
  CREATE TABLE public.crm_contact_links (
    id uuid PRIMARY KEY,
    zapp_contact_id uuid REFERENCES public.contacts(id),
    verified_at timestamptz
  );
  CREATE TABLE public.contact_notes (
    id uuid PRIMARY KEY,
    contact_id uuid REFERENCES public.contacts(id),
    author_id uuid,
    body text
  );
" >/dev/null

seed_contacts() {
  psql_sql "
    DELETE FROM public.contact_notes;
    DELETE FROM public.crm_contact_links;
    DELETE FROM public.contacts;
    INSERT INTO public.contacts (id, name, phone) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Primario', '+5500000000001'),
      ('22222222-2222-2222-2222-222222222222', 'Secundario', '+5500000000002');
    INSERT INTO public.contact_notes (id, contact_id, author_id, body) VALUES
      ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
       '44444444-4444-4444-4444-444444444444', 'nota do secundario');
  " >/dev/null
}

# Versao com o defeito: guard de notas + merge_contacts_atomic como vivos hoje.
psql_file "$migration_bug" >/dev/null
seed_contacts

# VERBOSITY=verbose e OBRIGATORIO aqui: a assercao abaixo cobra o SQLSTATE 23505, e o
# psql NAO imprime o codigo na verbosidade padrao -- so "ERROR:  duplicate key value
# violates unique constraint \"contacts_phone_key\"". Sem isto o teste reprovava dizendo
# "bug nao reproduziu com o erro esperado (23505)" justamente quando o bug REPRODUZIA
# (run 43637xxxxx do job "Contrato DB offline", 1a vez que este teste rodou no CI).
# Medido nesta sessao: sem verbose a saida nao tem "23505"; com verbose sai
# "ERROR:  23505: duplicate key value violates unique constraint ...".
bug_output="$(docker exec "$container_name" psql -X -At -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -U postgres -d postgres -c \
  "SELECT public.merge_contacts_atomic('11111111-1111-1111-1111-111111111111', ARRAY['22222222-2222-2222-2222-222222222222']::uuid[], '{\"phone\":\"+5500000000002\"}'::jsonb)" 2>&1)" \
  && bug_status=0 || bug_status=$?

if (( bug_status == 0 )); then
  fail "bug nao reproduziu: escolher o telefone do secundario deveria travar a mesclagem, mas retornou $bug_output"
fi
[[ "$bug_output" == *'23505'* ]] || fail "bug nao reproduziu com o erro esperado (23505): $bug_output"
((passed += 1))
printf '[PASS] %s\n' 'reproduzido: escolher telefone do secundario trava a mesclagem com 23505 (unique_violation)'

expect_eq 'apos a falha, nenhum contato foi apagado (rollback integral)' '2' \
  "$(psql_sql "SELECT count(*) FROM public.contacts")"

# Aplica a correcao (CREATE OR REPLACE da mesma funcao) e repete o mesmo cenario.
seed_contacts
psql_file "$migration_fix" >/dev/null

fix_result="$(psql_sql "SELECT public.merge_contacts_atomic('11111111-1111-1111-1111-111111111111', ARRAY['22222222-2222-2222-2222-222222222222']::uuid[], '{\"phone\":\"+5500000000002\"}'::jsonb)")"
[[ "$fix_result" == *'"moved_relations": 1'* ]] || fail "merge corrigido deveria mover 1 relacao (a nota), obtido: $fix_result"
((passed += 1))
printf '[PASS] %s\n' 'corrigido: escolher telefone do secundario mescla com sucesso'

expect_eq 'primario fica com o telefone do secundario' '+5500000000002' \
  "$(psql_sql "SELECT phone FROM public.contacts WHERE id = '11111111-1111-1111-1111-111111111111'")"
expect_eq 'secundario foi apagado' '1' \
  "$(psql_sql "SELECT count(*) FROM public.contacts")"
expect_eq 'nota do secundario foi movida para o primario (guard de identidade nao bloqueou)' '11111111-1111-1111-1111-111111111111' \
  "$(psql_sql "SELECT contact_id::text FROM public.contact_notes WHERE id = '33333333-3333-3333-3333-333333333333'")"

# Nao vacuo: escolher o telefone do PRIMARIO (caminho que nunca teve o bug) continua funcionando.
seed_contacts
primary_phone_result="$(psql_sql "SELECT public.merge_contacts_atomic('11111111-1111-1111-1111-111111111111', ARRAY['22222222-2222-2222-2222-222222222222']::uuid[], '{\"phone\":\"+5500000000001\"}'::jsonb)")"
[[ "$primary_phone_result" == *'"moved_relations": 1'* ]] || fail "merge com telefone do primario deveria continuar funcionando: $primary_phone_result"
expect_eq 'telefone do primario preservado quando escolhido explicitamente' '+5500000000001' \
  "$(psql_sql "SELECT phone FROM public.contacts WHERE id = '11111111-1111-1111-1111-111111111111'")"

printf '\nmerge-contacts-phone-secundario: OK (%d verificacoes)\n' "$passed"
