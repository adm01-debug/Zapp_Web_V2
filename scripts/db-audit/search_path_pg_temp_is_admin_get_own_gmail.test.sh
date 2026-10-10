#!/usr/bin/env bash
set -euo pipefail

# n-148 — search_path com pg_temp em is_admin_or_supervisor e get_own_gmail_accounts:
#   Ambas as funcoes SECURITY DEFINER devem ter search_path = public, pg_temp
#   para evitar manipulacao via tabelas temporarias (pg_temp).
#   Teste com CREATE TEMP TABLE hostil: resultado nao muda.

CONTAINER="supabase-v2-26101007237ea3-v2-26101007237ea3-database-07a3fb45d87b"
PSQL="docker exec ${CONTAINER} psql -U postgres -d postgres -t -A"

PASS=0
FAIL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: ${label}"
    PASS=$((PASS + 1))
  else
    echo "FAIL: ${label} — esperado '${expected}', obtido '${actual}'"
    FAIL=$((FAIL + 1))
  fi
}

# 1) is_admin_or_supervisor tem search_path = public, pg_temp
proconfig=$($PSQL -c "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'is_admin_or_supervisor';")
assert_eq "is_admin_or_supervisor search_path" "{\"search_path=public, pg_temp\"}" "${proconfig}"

# 2) get_own_gmail_accounts tem search_path = public, pg_temp
proconfig=$($PSQL -c "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'get_own_gmail_accounts';")
assert_eq "get_own_gmail_accounts search_path" "{\"search_path=public, pg_temp\"}" "${proconfig}"

# 3) is_admin_or_supervisor retorna false para usuario sem role admin/supervisor
result=$($PSQL -c "SELECT public.is_admin_or_supervisor('00000000-0000-0000-0000-000000000000'::uuid);")
assert_eq "is_admin_or_supervisor sem admin/supervisor" "f" "${result}"

# 4) get_own_gmail_accounts retorna 0 linhas para usuario inexistente
result=$($PSQL -c "SELECT count(*) FROM public.get_own_gmail_accounts();")
assert_eq "get_own_gmail_accounts usuario inexistente" "0" "${result}"

# 5) CREATE TEMP TABLE hostil nao altera resultado de is_admin_or_supervisor
#    Usa -c com SQL multilinhas e extrai a ultima linha (o SELECT result)
result=$($PSQL -c "CREATE TEMP TABLE hostil (user_id uuid, role text); INSERT INTO hostil VALUES ('00000000-0000-0000-0000-000000000000', 'admin'); SELECT public.is_admin_or_supervisor('00000000-0000-0000-0000-000000000000'::uuid);" | tail -1)
assert_eq "is_admin_or_supervisor com temp table hostil" "f" "${result}"

echo ""
echo "Resultado: ${PASS} passaram, ${FAIL} falharam"
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi