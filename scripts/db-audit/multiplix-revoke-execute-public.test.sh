#!/usr/bin/env bash
# N-144 — Prova que a migration 20261010101613 revoga EXECUTE de PUBLIC, anon e
# authenticated na função de gatilho REAL
# public.multiplix_audiences_validate_shared_roles() (criada pela migration
# real 20261001261230, F35 — sem stub da função) e que só postgres/service_role
# conservam EXECUTE, sem quebrar a inserção como authenticated (função trigger
# dispensa EXECUTE no disparo).
#
# Bloco A — estado ANTERIOR (defeito, função real pós-F35): PUBLIC/anon/
#   authenticated têm EXECUTE; nenhuma entrada explícita para service_role.
# Bloco B — migration aplicada: só postgres/service_role têm EXECUTE; chamada
#   direta como anon/authenticated recebe `permission denied`; INSERT como
#   authenticated funciona (o gatilho dispara).
# Bloco C — rollback extraído do próprio arquivo da migration: PUBLIC volta.
# Bloco D — reaplicação idempotente: só postgres/service_role.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
f35="$migrations_dir/20261001261230_f35_multiplix_audiences.sql"
migration="$migrations_dir/20261010101613_revoke_execute_public_multiplix_trigger.sql"
postgres_image="${MULTIPLIX_REVOKE_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-multiplix-revoke-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-multiplix-revoke-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_stdin() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

migration_arquivo() {
  local file="$migrations_dir/$1"
  [[ -f "$file" ]] || fail "migration ausente: $1"
  printf '  · %s\n' "$1" >&2
  psql_file "$file" >/dev/null
}

as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}

as_anon() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $1"
}

expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

expect_ok_as() {
  local l="$1" j="$2" s="$3" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$4" ]] || fail "$l: esperado '$4', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

# Prova que o papel recebe `permission denied` ao chamar a função diretamente
# (SELECT ...): a checagem de EXECUTE vem antes de qualquer execução.
expect_perm_denied() {
  local l="$1" modo="$2" output status
  set +e
  if [[ "$modo" == anon ]]; then
    output="$(as_anon 'SELECT public.multiplix_audiences_validate_shared_roles();' 2>&1)"
    status=$?
  else
    output="$(as_user "$modo" 'SELECT public.multiplix_audiences_validate_shared_roles();' 2>&1)"
    status=$?
  fi
  set -e
  (( status != 0 )) || { printf '%s\n' "$output" >&2; fail "$l: deveria ter falhado, mas passou"; }
  [[ "$output" == *permission*denied* ]] || { printf '%s\n' "$output" >&2; fail "$l: falhou sem 'permission denied'"; }
  printf '[PASS] %s\n' "$l"
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

# ── infraestrutura que o Supabase fornece + dependências reais da F35 ─────────
# (auth com uid()/role(), papéis da API, enum app_role, profiles/user_roles e
# os helpers que as policies da F35 chamam: has_role e is_admin_or_supervisor
# com a assinatura real; update_updated_at_column para o 2º trigger da F35).
psql_stdin >/dev/null <<'SQL'
CREATE SCHEMA auth;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
ALTER ROLE service_role BYPASSRLS;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent', 'special_agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = statement_timestamp(); RETURN NEW; END
$$;

-- Ator: admin dono (o perfil que a policy "Users can create audiences" exige).
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-00000000000a', 'admin');
GRANT ALL ON public.profiles, public.user_roles TO authenticated;
SQL
printf '=== Infraestrutura + dependências da F35 criadas ===\n'

# ── a migration REAL que criou a função (sem stub) ────────────────────────────
migration_arquivo "20261001261230_f35_multiplix_audiences.sql"

# Entrada PUBLIC no proacl (grantee = 0): prova sobre o PUBLIC em si, não via anon.
tem_public_execute() {
  psql_sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE n.nspname = 'public' AND p.proname = 'multiplix_audiences_validate_shared_roles' AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'" | tail -n1
}
tem_service_role_explicito() {
  psql_sql "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE n.nspname = 'public' AND p.proname = 'multiplix_audiences_validate_shared_roles' AND a.grantee = 'service_role'::regrole AND a.privilege_type = 'EXECUTE'" | tail -n1
}

# ── Bloco A: defeito na função REAL (pós-F35, pré-migration) ──────────────────
printf '\n=== Bloco A: estado ANTERIOR (defeito na função real) ===\n'
[[ "$(tem_public_execute)" == '1' ]] || fail 'A.1 PUBLIC sem EXECUTE na função real: o defeito não reproduziu'
printf '[PASS] A.1 PUBLIC tem EXECUTE na função real (defeito)\n'

expect_value 'A.2 anon tem EXECUTE da função real (defeito)' 't' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'A.3 authenticated tem EXECUTE da função real (defeito)' 't' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

[[ "$(tem_service_role_explicito)" == '0' ]] || fail 'A.4 service_role já tinha entrada explícita: o rollback não precisaria do REVOKE'
printf '[PASS] A.4 sem entrada explícita para service_role (estado anterior exato)\n'

# ── Bloco B: migration desta tarefa aplicada ──────────────────────────────────
printf '\n=== Bloco B: migration aplicada ===\n'
migration_arquivo "20261010101613_revoke_execute_public_multiplix_trigger.sql"
printf 'Migration aplicada.\n'

[[ "$(tem_public_execute)" == '0' ]] || fail 'B.1 PUBLIC ainda tem EXECUTE depois da migration'
printf '[PASS] B.1 PUBLIC sem EXECUTE (sem entrada grantee=0 no proacl)\n'

expect_value 'B.2 anon NÃO tem mais EXECUTE' 'f' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'B.3 authenticated NÃO tem mais EXECUTE' 'f' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'B.4 service_role conserva EXECUTE' 't' \
  "SELECT has_function_privilege('service_role','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'B.5 postgres conserva EXECUTE' 't' \
  "SELECT has_function_privilege('postgres','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_perm_denied 'B.6 anon recebe permission denied ao chamar a função' anon

admin_jwt='{"role":"authenticated","sub":"20000000-0000-0000-0000-00000000000a"}'
expect_perm_denied 'B.7 authenticated recebe permission denied ao chamar a função' "$admin_jwt"

# A inserção como authenticated continua funcionando (o gatilho dispara sem
# precisar de EXECUTE): prova que a revogação não quebrou o fluxo legítimo.
expect_ok_as 'B.8 INSERT como authenticated funciona (gatilho dispara)' "$admin_jwt" \
  "INSERT INTO public.multiplix_audiences (name, kind, owner_id) VALUES ('Público do A', 'static_list', '10000000-0000-0000-0000-00000000000a') RETURNING 1;" '1'

expect_value 'B.9 linha inserida presente' '1' \
  "SELECT count(*) FROM public.multiplix_audiences WHERE owner_id = '10000000-0000-0000-0000-00000000000a'"

# ── Bloco C: rollback extraído do próprio arquivo da migration ────────────────
printf '\n=== Bloco C: rollback executado ===\n'
rollback_sql="$(grep -E '^-- Rollback:' "$migration" | sed 's/^-- Rollback: //')"
[[ -n "$rollback_sql" ]] || fail 'rollback ausente no cabeçalho da migration'
psql_sql "$rollback_sql" >/dev/null
printf 'Rollback executado.\n'

[[ "$(tem_public_execute)" == '1' ]] || fail 'C.1 PUBLIC sem EXECUTE depois do rollback'
printf '[PASS] C.1 PUBLIC com EXECUTE de volta (rollback)\n'

expect_value 'C.2 anon tem EXECUTE de volta (rollback)' 't' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'C.3 authenticated tem EXECUTE de volta (rollback)' 't' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'C.4 service_role tem EXECUTE (via PUBLIC, sem entrada explícita)' 't' \
  "SELECT has_function_privilege('service_role','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"
[[ "$(tem_service_role_explicito)" == '0' ]] || fail 'C.5 rollback deixou entrada explícita para service_role (estado anterior não tinha)'
printf '[PASS] C.5 sem entrada explícita para service_role (estado anterior restaurado)\n'

# ── Bloco D: reaplicação idempotente ──────────────────────────────────────────
printf '\n=== Bloco D: reaplicação idempotente ===\n'
migration_arquivo "20261010101613_revoke_execute_public_multiplix_trigger.sql"
printf 'Migration reaplicada.\n'

[[ "$(tem_public_execute)" == '0' ]] || fail 'D.1 PUBLIC com EXECUTE após reaplicação'
printf '[PASS] D.1 PUBLIC sem EXECUTE (reaplicação)\n'

expect_value 'D.2 anon NÃO tem EXECUTE (reaplicação)' 'f' \
  "SELECT has_function_privilege('anon','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'D.3 authenticated NÃO tem EXECUTE (reaplicação)' 'f' \
  "SELECT has_function_privilege('authenticated','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

expect_value 'D.4 service_role conserva EXECUTE (reaplicação)' 't' \
  "SELECT has_function_privilege('service_role','public.multiplix_audiences_validate_shared_roles()','EXECUTE')"

printf '\n=== Todos os blocos passaram ===\n'
