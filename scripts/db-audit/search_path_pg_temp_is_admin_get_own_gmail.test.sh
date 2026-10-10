#!/usr/bin/env bash
# n-148 — search_path com pg_temp em is_admin_or_supervisor e get_own_gmail_accounts:
#   Ambas as funcoes SECURITY DEFINER devem ter search_path = public, pg_temp
#   para evitar manipulacao via tabelas temporarias em pg_temp.

set -Eeuo pipefail

container="supabase-v2-26101007237ea3-v2-26101007237ea3-database-07a3fb45d87b"

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_sql() { docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }

expect_config() {
  local func_name="$1" expected="$2" actual
  actual="$(psql_sql "SELECT proconfig FROM pg_proc WHERE proname = '$func_name';" | tr -d '{}"')"
  [[ "$actual" == *"$expected"* ]] || fail "$func_name: esperado '$expected' em proconfig, obtido '$actual'"
  pass "$func_name tem search_path=$expected"
}

expect_config is_admin_or_supervisor "search_path=public, pg_temp"
expect_config get_own_gmail_accounts "search_path=public, pg_temp"

# Verifica que is_admin_or_supervisor ainda retorna FALSE para usuario sem role admin/supervisor.
result="$(psql_sql "SELECT public.is_admin_or_supervisor('00000000-0000-0000-0000-000000000000');")"
[[ "$result" == "f" ]] || fail "is_admin_or_supervisor para usuario inexistente deveria retornar false, obteve '$result'"
pass "is_admin_or_supervisor retorna false para usuario sem role admin/supervisor"

# Verifica que get_own_gmail_accounts retorna vazio (sem gmail_accounts para usuario inexistente).
count="$(psql_sql "SELECT count(*) FROM public.get_own_gmail_accounts();")"
[[ "$count" == "0" ]] || fail "get_own_gmail_accounts para usuario inexistente deveria retornar 0 linhas, obteve '$count'"
pass "get_own_gmail_accounts retorna 0 linhas para usuario inexistente"

printf '\n[INFO] Todas as verificacoes passaram.\n'