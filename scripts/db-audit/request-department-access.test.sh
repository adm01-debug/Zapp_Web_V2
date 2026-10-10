#!/usr/bin/env bash
# TC-N071 — request_department_access RPC: cria notificacao para admins do
# departamento e linha access_requested na auditoria; anon recebe recusa.
#
# Bloco A — estado ANTERIOR (defeito): a funcao nao existe, chamada falha.
# Bloco B — migration aplicada: authenticated chama, admins recebem notificacao,
# auditoria registra, anon recebe not_authenticated.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010024534_request_department_access_rpc.sql"
postgres_image="${REQUEST_DEPT_ACCESS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-request-dept-access-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-request-dept-access-test-[0-9]+$ ]]; then
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
  local uid="$1" sql="$2"
  local jwt="{\"sub\":\"$uid\"}"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); SELECT set_config('request.jwt.claim.sub', '$uid', false); $sql"
}
as_anon() {
  local sql="$1"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $sql"
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
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_as_anon() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_anon "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_value_as_anon() {
  local l="$1" expected="$2" s="$3" out st
  set +e; out="$(as_anon "$s" 2>&1)"; st=$?; set -e
  (( st != 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria ter sucesso como anon"; }
  [[ "$out" == *"$expected"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$expected' no resultado, obtido '$out'"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# Pre-migration schema: tabelas e funcoes auxiliares que existiam antes desta migration.
psql_sql "CREATE ROLE anon NOLOGIN;" >/dev/null
psql_sql "CREATE ROLE authenticated NOLOGIN;" >/dev/null
psql_sql "CREATE ROLE service_role NOLOGIN BYPASSRLS;" >/dev/null
psql_sql "CREATE SCHEMA IF NOT EXISTS auth;" >/dev/null
psql_sql "CREATE TABLE auth.users (id uuid PRIMARY KEY);" >/dev/null
psql_sql "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;" >/dev/null

psql_sql "CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'supervisor', 'agent')),
  department_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);" >/dev/null

psql_sql "CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);" >/dev/null

psql_sql "CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);" >/dev/null

psql_sql "CREATE TABLE public.department_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);" >/dev/null

psql_sql "CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'agent')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);" >/dev/null

psql_sql "CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 \$\$;" >/dev/null

psql_sql "CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor')) \$\$;" >/dev/null

psql_sql "ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;" >/dev/null
psql_sql "CREATE POLICY \"Profiles are viewable by authenticated\" ON public.profiles FOR SELECT TO authenticated USING (true);" >/dev/null
psql_sql "CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 \$\$;" >/dev/null
psql_sql "ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;" >/dev/null
psql_sql "ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;" >/dev/null
psql_sql "ALTER TABLE public.department_audit_logs ENABLE ROW LEVEL SECURITY;" >/dev/null
psql_sql "CREATE POLICY \"System can insert notifications\" ON public.notifications FOR INSERT WITH CHECK (true);" >/dev/null
psql_sql "GRANT SELECT ON public.profiles TO authenticated;" >/dev/null
psql_sql "GRANT SELECT ON public.departments TO authenticated;" >/dev/null
psql_sql "CREATE POLICY \"Notifications are viewable by authenticated\" ON public.notifications FOR SELECT TO authenticated USING (true);" >/dev/null
psql_sql "GRANT INSERT ON public.notifications TO authenticated;" >/dev/null
psql_sql "GRANT SELECT ON public.notifications TO authenticated;" >/dev/null
psql_sql "GRANT INSERT ON public.department_audit_logs TO authenticated;" >/dev/null
psql_sql "GRANT SELECT ON public.department_audit_logs TO authenticated;" >/dev/null
psql_sql "CREATE POLICY \"Audit logs are viewable by authenticated\" ON public.department_audit_logs FOR SELECT TO authenticated USING (true);" >/dev/null

# Bloco A — defeito: a funcao nao existe ainda.
printf '\n== Bloco A: antes da migration (defeito) ==\n'

DEPT_ID="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ADMIN_PROFILE="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
ADMIN_USER="cccccccc-cccc-cccc-cccc-cccccccccccc"
REQUESTER_PROFILE="dddddddd-dddd-dddd-dddd-dddddddddddd"
REQUESTER_USER="eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"

# Todos os usuarios precisam existir em auth.users antes de profiles (FK)
psql_sql "INSERT INTO auth.users (id) VALUES
  ('$ADMIN_USER'), ('$REQUESTER_USER');" >/dev/null

psql_sql "INSERT INTO public.departments(id, name) VALUES ('$DEPT_ID', 'Departamento Teste');" >/dev/null
psql_sql "INSERT INTO public.profiles(id, user_id, name, role, department_id) VALUES ('$ADMIN_PROFILE', '$ADMIN_USER', 'Admin Teste', 'admin', '$DEPT_ID');" >/dev/null

expect_error_as 'A.1 request_department_access nao existe antes da migration' 'does not exist' "$ADMIN_USER" "SELECT public.request_department_access('$DEPT_ID');"

printf '\n== Aplicando migration ==\n'
psql_file "$migration" >/dev/null

# Bloco B — correcao: a funcao funciona corretamente.
printf '\n== Bloco B: apos a migration (correcao) ==\n'

psql_sql "INSERT INTO public.profiles(id, user_id, name, role, department_id) VALUES ('$REQUESTER_PROFILE', '$REQUESTER_USER', 'Requester Teste', 'agent', '$DEPT_ID');" >/dev/null

# B.1 authenticated consegue chamar e recebe ok
expect_value_as 'B.1 authenticated chama request_department_access e recebe ok' \
  '{"ok": true}' \
  "$REQUESTER_USER" "SELECT public.request_department_access('$DEPT_ID');"

# B.2 nasce 1 notificacao para o admin do departamento
expect_value_as 'B.2a admin profile existe no departamento' '1' \
  "$REQUESTER_USER" "SELECT count(*) FROM public.profiles WHERE department_id = '$DEPT_ID' AND role = 'admin';"
expect_value_as 'B.2 notificacao criada para o admin do departamento' '1' \
  "$REQUESTER_USER" "SELECT count(*) FROM public.notifications WHERE user_id = '$ADMIN_USER' AND title = 'Pedido de acesso ao departamento';"

# B.3 nasce 1 linha access_requested na auditoria
expect_value_as 'B.3 linha access_requested na auditoria' '1' \
  "$REQUESTER_USER" "SELECT count(*) FROM public.department_audit_logs WHERE department_id = '$DEPT_ID' AND action = 'access_requested';"

expect_value_as_anon 'B.4 anon recebe not_authenticated' \
  'not_authenticated' \
  "SELECT public.request_department_access('$DEPT_ID');"

printf '\nPASS: TC-N071 — request_department_access cria notificacoes para admins, auditoria registra access_requested, anon recebe recusa.\n'