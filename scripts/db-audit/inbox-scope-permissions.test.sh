#!/usr/bin/env bash
# Permissoes de escopo da inbox + trilha de auditoria de tentativa indevida.
# Origem: docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md e decisao do Joaquim (11/10).
#
# Causa raiz: a V2 so libera "Mostrar todos" por permissao, mas NAO existia permissao de escopo
# (departamento/todos) nem registro de tentativa fora do escopo. Esta suite prova, em Postgres 17
# descartavel, aplicando as migrations REAIS:
#   BLOCO A (antes): as permissoes e a funcao nao existem.
#   BLOCO B (depois): duas permissoes semeadas, atribuidas a admin/supervisor; a funcao registra a
#     tentativa em audit_logs SOBREVIVENDO a RLS de audit_logs (SECURITY DEFINER), com dedupe por
#     usuario+escopo+hora, entrada invalida tratada, anonimo sem EXECUTE e sem gravacao.
#   BLOCO C (rollback): as tres statements do cabecalho `-- Rollback (SQL executavel)` desfazem tudo.
#
# Prova executada como os papeis REAIS (authenticated, anon, service_role), nunca como dono.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011142742_inbox_scope_permissions.sql"
# Prerequisito real: coluna dedupe_key + indice unico parcial em audit_logs.
dedupe_migration="$repo_root/supabase/migrations/20261004190606_audit_logs_dedupe_key_webhook_elevenlabs.sql"
postgres_image="${INBOX_SCOPE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-inbox-scope-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-inbox-scope-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
run_sql() { psql_sql "$1" >/dev/null; }
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$dedupe_migration" ]] || fail "migration de prerequisito nao encontrada: $dedupe_migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

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

-- Catalogo de permissao e papel, espelhando a producao (role_permissions.role e o enum app_role).
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission_id)
);

-- audit_logs como em producao (colunas) + a policy que BLOQUEIA insert direto de authenticated.
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_block_authenticated_insert ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (false);
-- Em producao o privilegio e a RLS juntos barram: damos o GRANT para provar que e a POLICY
-- (WITH CHECK false) que impede o insert direto, nao a falta de privilegio.
GRANT INSERT ON public.audit_logs TO authenticated;
SQL

psql_file "$tmp_dir/pre.sql"
# Prerequisito REAL (dedupe_key + indice unico parcial) aplicado como em producao.
psql_file "$dedupe_migration"

ALICE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
ALICE_CALL_ALL="SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT public.log_unauthorized_inbox_scope('all');"
ALICE_CALL_ALL2="SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT public.log_unauthorized_inbox_scope('all');"
ALICE_CALL_DEPT="SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT public.log_unauthorized_inbox_scope('department');"
ALICE_CALL_NULL="SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT public.log_unauthorized_inbox_scope(NULL);"
ALICE_CALL_LONG="SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT public.log_unauthorized_inbox_scope(repeat('x', 200));"
COUNT_AUDIT="SELECT count(*) FROM public.audit_logs WHERE action = 'unauthorized_inbox_scope_access'"

echo '-- BLOCO A: ANTES da migration (o que faltava) -------------------------------------'
expect_value 'A1 as permissoes de escopo ainda nao existem' '0' \
  "SELECT count(*) FROM public.permissions WHERE name IN ('inbox.view_department','inbox.view_all')"
expect_value 'A2 a funcao de auditoria ainda nao existe' 't' \
  "SELECT to_regprocedure('public.log_unauthorized_inbox_scope(text)') IS NULL"

echo
echo '-- Aplicando a migration ------------------------------------------------------------'
psql_file "$migration"

echo
echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'
expect_value 'B1 as duas permissoes existem na categoria inbox' '2' \
  "SELECT count(*) FROM public.permissions WHERE name IN ('inbox.view_department','inbox.view_all') AND category = 'inbox'"
expect_value 'B2 admin e supervisor recebem os dois escopos (2 papeis x 2 permissoes)' '4' \
  "SELECT count(*) FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id WHERE p.name IN ('inbox.view_department','inbox.view_all')"
expect_value 'B3 agente comum NAO recebe escopo nenhum' '0' \
  "SELECT count(*) FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id WHERE p.name IN ('inbox.view_department','inbox.view_all') AND rp.role = 'agent'::public.app_role"

expect_value 'B4 authenticated tem EXECUTE na funcao' 't' \
  "SELECT has_function_privilege('authenticated','public.log_unauthorized_inbox_scope(text)','EXECUTE')"
expect_value 'B5 anon NAO tem EXECUTE na funcao' 'f' \
  "SELECT has_function_privilege('anon','public.log_unauthorized_inbox_scope(text)','EXECUTE')"
expect_value 'B6 service_role NAO tem EXECUTE na funcao' 'f' \
  "SELECT has_function_privilege('service_role','public.log_unauthorized_inbox_scope(text)','EXECUTE')"

# A RLS de audit_logs bloqueia insert direto de authenticated: prova que a trilha so passa pela funcao.
expect_error 'B7 insert direto em audit_logs como authenticated e bloqueado pela RLS' \
  'row-level security' \
  "SET ROLE authenticated; INSERT INTO public.audit_logs (action) VALUES ('forjado');"

run_sql "$ALICE_CALL_ALL"
expect_value 'B8 ALICE, authenticated, gera 1 linha de auditoria' '1' "$COUNT_AUDIT"
expect_value 'B9 a linha guarda o escopo pedido e o autor' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'unauthorized_inbox_scope_access' AND details->>'scope' = 'all' AND user_id = '11111111-1111-1111-1111-111111111111'"

run_sql "$ALICE_CALL_ALL2"
expect_value 'B10 segunda chamada com o MESMO escopo na mesma hora nao duplica (dedupe)' '1' "$COUNT_AUDIT"

run_sql "$ALICE_CALL_DEPT"
expect_value 'B11 escopo diferente gera nova linha (dedupe e por escopo)' '2' "$COUNT_AUDIT"

run_sql "$ALICE_CALL_NULL"
expect_value 'B12 escopo invalido (NULL) nao quebra e vira unknown' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE details->>'scope' = 'unknown'"
run_sql "$ALICE_CALL_LONG"
expect_value 'B13 escopo longo demais nao quebra e deduplica em unknown' '3' "$COUNT_AUDIT"

expect_error 'B14 anonimo e barrado com permission denied' \
  'permission denied' \
  "SET ROLE anon; SELECT public.log_unauthorized_inbox_scope('all');"
expect_value 'B15 nada foi gravado por anonimo' '3' "$COUNT_AUDIT"

run_sql "SET ROLE authenticated; SELECT set_config('request.jwt.claims','',false); SELECT public.log_unauthorized_inbox_scope('all');"
expect_value 'B16 authenticated sem claims (uid nulo) nao grava' '3' "$COUNT_AUDIT"

echo
echo '-- BLOCO C: rollback do cabecalho --------------------------------------------------'
awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;c++} f&&c==3{exit}' \
  "$migration" > "$tmp_dir/rollback.sql"
psql_file "$tmp_dir/rollback.sql"
expect_value 'C1 rollback remove as permissoes semeadas' '0' \
  "SELECT count(*) FROM public.permissions WHERE name IN ('inbox.view_department','inbox.view_all')"
expect_value 'C2 rollback remove as atribuicoes' '0' \
  "SELECT count(*) FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id WHERE p.name IN ('inbox.view_department','inbox.view_all')"
expect_value 'C3 rollback remove a funcao' 't' \
  "SELECT to_regprocedure('public.log_unauthorized_inbox_scope(text)') IS NULL"

printf '\n[OK] permissoes de escopo da inbox + auditoria de tentativa indevida verificadas\n'
