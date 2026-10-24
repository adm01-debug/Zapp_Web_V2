#!/usr/bin/env bash
# Contrato de banco da espera crescente do gmail-cron-sync (t_d7ef14d6).
#
# A migration 20261014023912_gmail_accounts_sync_backoff.sql acrescenta
# error_count / next_attempt_at a public.gmail_accounts. Este teste prova:
#   A (antes)  -- as colunas NAO existem ainda;
#   B (depois) -- existem com tipo/default/not-null corretos, a linha antiga
#                 herda error_count = 0 e next_attempt_at NULL, e o ACL da
#                 tabela (o papel real) e IDENTICO antes e depois: a adicao de
#                 coluna nao concede nada a anon/authenticated (nada afrouxado);
#   C          -- o Rollback declarado no topo da migration desfaz a adicao.
#   Vacuidade  -- ZAPP_GMAIL_BACKOFF_SEM_MIGRACAO=1 nao aplica a migration e o
#                 bloco B tem de FALHAR (as assercoes nao sao vazias).
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261014023912_gmail_accounts_sync_backoff.sql"
postgres_image="${GMAIL_BACKOFF_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-gmail-backoff-test-$$"
sem_migracao="${ZAPP_GMAIL_BACKOFF_SEM_MIGRACAO:-0}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-gmail-backoff-test-[0-9]+$ ]]; then
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
expect_fail_value() { # em V2: o comando/asserção tem de NAO bater com o esperado
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" != "$expected" ]] || fail "$label: deveria divergir de '$expected' (vacuidade quebrada)"
  printf '[PASS] %s (vacuidade)\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
rollback_sql="$(grep -E '^--   (alter|drop|create|insert|update|delete|revoke|grant) ' "$migration" | sed 's/^--   //' | tr '\n' ' ')"
[[ -n "$rollback_sql" ]] || fail 'a migration nao declara o SQL executavel do rollback no topo'

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

# Tabela no estado ANTES da migration, com o ACL real do espelho de producao
# (authenticated: SELECT/UPDATE; service_role: CRUD; anon: nada) e RLS ligado.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sync_status text NOT NULL DEFAULT 'idle',
  last_error text,
  token_expires_at timestamptz,
  history_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gmail_accounts FROM PUBLIC, anon;
GRANT SELECT, UPDATE, TRIGGER, TRUNCATE ON public.gmail_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRIGGER, TRUNCATE, REFERENCES ON public.gmail_accounts TO service_role;

INSERT INTO public.gmail_accounts (user_id, email_address)
  VALUES ('11111111-1111-1111-1111-111111111111', 'conta@exemplo.test');
SQL

acl_sql="SELECT coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), '') FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'gmail_accounts'"
colunas_sql="SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gmail_accounts' AND column_name IN ('error_count','next_attempt_at')"

psql_file "$tmp_dir/pre.sql"
acl_antes="$(psql_sql "$acl_sql" | tail -n1)"

echo '-- BLOCO A: ANTES da migration -----------------------------------------------------'
expect_value 'A1 as colunas ainda nao existem' '0' "$colunas_sql"
[[ -n "$acl_antes" ]] || fail 'A2 nao foi possivel ler o ACL inicial'
printf '[PASS] A2 ACL inicial capturado (%s)\n' "$acl_antes"

echo
echo '-- BLOCO B: DEPOIS da migration ----------------------------------------------------'
if [[ "$sem_migracao" == 1 ]]; then
  echo '[MUTACAO] ZAPP_GMAIL_BACKOFF_SEM_MIGRACAO=1: migration NAO aplicada, o BLOCO B tem de FALHAR'
  expect_fail_value 'B1 (vacuidade) as colunas apareceram' '2' "$colunas_sql"
  exit 0
fi

psql_file "$migration"

expect_value 'B1 error_count e next_attempt_at existem' '2' "$colunas_sql"
expect_value 'B2 error_count e integer NOT NULL com default 0' \
  'integer|NO|0' \
  "SELECT data_type || '|' || is_nullable || '|' || column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='gmail_accounts' AND column_name='error_count'"
expect_value 'B3 next_attempt_at e timestamptz (aceita NULL = ja pode tentar)' \
  'timestamp with time zone|YES|' \
  "SELECT data_type || '|' || is_nullable || '|' || coalesce(column_default,'') FROM information_schema.columns WHERE table_schema='public' AND table_name='gmail_accounts' AND column_name='next_attempt_at'"
expect_value 'B4 a linha antiga herda error_count = 0' '0' \
  "SELECT error_count FROM public.gmail_accounts WHERE email_address = 'conta@exemplo.test'"
expect_value 'B5 e next_attempt_at NULL (conta volta a ser tentada)' 'true' \
  "SELECT (next_attempt_at IS NULL)::text FROM public.gmail_accounts WHERE email_address = 'conta@exemplo.test'"

acl_depois="$(psql_sql "$acl_sql" | tail -n1)"
[[ "$acl_depois" == "$acl_antes" ]] || fail "B6 o ACL mudou: antes '$acl_antes', depois '$acl_depois'"
printf '[PASS] B6 o ACL da tabela e identico antes/depois (nada afrouxado)\n'

expect_value 'B7 anon NAO ganhou leitura da coluna nova' 'false' \
  "SELECT has_column_privilege('anon','public.gmail_accounts','error_count','SELECT')::text"
expect_value 'B8 service_role le a coluna nova' 'true' \
  "SELECT has_column_privilege('service_role','public.gmail_accounts','error_count','SELECT')::text"

echo
echo '-- BLOCO C: Rollback declarado no topo da migration -------------------------------'
psql_sql "$rollback_sql" >/dev/null
expect_value 'C1 o Rollback remove as duas colunas' '0' "$colunas_sql"

printf '\n[OK] espera crescente do gmail_accounts verificada (aditiva, sem ampliar privilegio)\n'
