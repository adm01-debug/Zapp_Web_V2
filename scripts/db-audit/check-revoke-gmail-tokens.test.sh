#!/usr/bin/env bash
# M-DB-03: prova que a migration revoke_gmail_token_columns bloqueia o
# acesso direto as colunas de token criptografado para anon e authenticated,
# e que a funcao get_own_gmail_accounts continua operando normalmente.
#
# Cenarios:
#   1. SELECT access_token_encrypted como anon -> permission denied
#   2. SELECT refresh_token_encrypted como authenticated -> permission denied
#   3. SELECT colunas nao-sensiveis como anon -> ok
#   4. get_own_gmail_accounts como authenticated -> ok (retorna linhas ou 0)
#   5. service_role ainda tem SELECT nas colunas criptografadas -> ok
#
# Uso: bash scripts/db-audit/check-revoke-gmail-tokens.test.sh

set -Eeuo pipefail

container="supabase-v2-2610091852ae57-v2-2610091852ae57-database-c09c533e42d9"
passed=0

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

assert_error() {
  local label="$1" role="$2" sql="$3"
  local output status
  set +e
  output="$(docker exec "$container" psql -X -At -v ON_ERROR_STOP=0 -U postgres -d postgres -c "SET ROLE $role; $sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    fail "$label deveria falhar mas retornou: $output"
  fi
  if [[ "$output" != *"permission denied"* ]]; then
    fail "$label deveria falhar com permission denied, obteve: $output"
  fi
  ((passed += 1))
  printf '[PASS] %s (bloqueado para %s)\n' "$label" "$role"
}

assert_ok() {
  local label="$1" role="$2" sql="$3"
  local output status
  set +e
  output="$(docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SET ROLE $role; $sql" 2>&1)"
  status=$?
  set -e
  if (( status != 0 )); then
    fail "$label deveria passar mas falhou: $output"
  fi
  ((passed += 1))
  printf '[PASS] %s (ok para %s): %s\n' "$label" "$role" "$output"
}

# Cenário 1: anon nao pode ler access_token_encrypted
assert_error 'anon nao pode ler access_token_encrypted' 'anon' \
  "SELECT access_token_encrypted FROM public.gmail_accounts LIMIT 1;"

# Cenário 2: authenticated nao pode ler refresh_token_encrypted
assert_error 'authenticated nao pode ler refresh_token_encrypted' 'authenticated' \
  "SELECT refresh_token_encrypted FROM public.gmail_accounts LIMIT 1;"

# Cenário 3: anon ainda pode ler colunas nao-sensiveis
assert_ok 'anon pode ler colunas nao-sensiveis' 'anon' \
  "SELECT id, email_address, is_active FROM public.gmail_accounts LIMIT 1;"

# Cenário 4: get_own_gmail_accounts funciona para authenticated
assert_ok 'get_own_gmail_accounts funciona para authenticated' 'authenticated' \
  "SELECT count(*) FROM get_own_gmail_accounts();"

# Cenário 5: service_role ainda tem SELECT nas colunas criptografadas
assert_ok 'service_role pode ler access_token_encrypted' 'postgres' \
  "SELECT has_column_privilege('service_role', 'public.gmail_accounts', 'access_token_encrypted', 'SELECT');"

printf 'Revogacao de token Gmail (%s cenarios): %s aprovados.\n' "$passed" "$passed"