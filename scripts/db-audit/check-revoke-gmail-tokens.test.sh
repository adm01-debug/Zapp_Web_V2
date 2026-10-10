#!/usr/bin/env bash
# N-138 — colunas de token criptografado de public.gmail_accounts fora do alcance
# do navegador (anon/authenticated).
#
# DEFEITO: access_token_encrypted e refresh_token_encrypted sao legiveis por SELECT
# direto por anon e authenticated. A causa e um grant de SELECT no NIVEL DA TABELA
# (privilegio default do schema public), que cobre todas as colunas — e um REVOKE por
# COLUNA nao remove um grant de TABELA (PG17, REVOKE, Description). A correcao tem de
# revogar o grant de TABELA e reconceder SELECT apenas nas colunas nao-sensiveis.
#
# ESTE CONTRATO roda em PostgreSQL DESCARTÁVEL (docker), no padrao dos testes irmaos
# scripts/db-audit/revoke-auth-sessions.test.sh e scripts/db-audit/l11-departments-acl-escrita.test.sh
# (container efemero de nome unico, trap cleanup, fixtures minimas, migration real aplicada,
# containers derrubados no fim). NENHUM nome de container fixo e NENHUM docker exec em banco
# compartilhado. Roda pelo envoltorio scripts/db-audit/retry-disposable-postgres-test.sh.
#
# Sequencia:
#   RED   — sem a migration, anon/authenticated LEEM as colunas criptografadas (furo reproduzido).
#   GREEN — com a migration aplicada (criterio 1/2):
#     1. anon + SELECT access_token_encrypted          -> permission denied
#     2. authenticated + SELECT refresh_token_encrypted-> permission denied
#     3. anon + SELECT colunas nao-sensiveis           -> ok
#     4. authenticated + count(*) FROM get_own_gmail_accounts() -> ok
#     5. service_role/postgres mantem SELECT nas colunas criptografadas -> ok
#   Extra — a view security_invoker gmail_accounts_safe segue legivel por authenticated.
#
# Uso: bash scripts/db-audit/check-revoke-gmail-tokens.test.sh
#      GMAIL_TOKEN_COLS_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011003002_revoke_gmail_token_columns.sql"
postgres_image="${GMAIL_TOKEN_COLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-gmail-token-cols-test-$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-gmail-token-cols-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

# Roda SQL no banco descartavel. ON_ERROR_STOP controlado pelo chamador.
psql_db() { # db sql
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"
}
psql_role() { # db role sql  (SET ROLE antes; ON_ERROR_STOP=0 para capturar o erro real)
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=0 -U postgres -d "$1" \
    -c "SET ROLE $2; $3"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

# O arquivo do repo tem as duas linhas que a migration promete (afirmacao, nao contagem).
grep -qF 'REVOKE ALL ON public.gmail_accounts FROM anon, authenticated;' "$migration" ||
  fail 'o arquivo do repo perdeu o REVOKE de TABELA'
grep -qF ') ON public.gmail_accounts TO anon, authenticated;' "$migration" ||
  fail 'o arquivo do repo perdeu o GRANT de SELECT das colunas nao-sensiveis'
ok 'o arquivo do repo tem o REVOKE de TABELA e o GRANT de colunas (o teste so le)'

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=gmail_token_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if docker exec "$container_name" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# ── roles (cluster-global, criadas UMA vez) ──────────────────────────────────────────────
psql_db postgres '
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
' >/dev/null

# ── fixtures minimas: auth.uid() stub + a tabela com as 14 colunas do schema vivo ─────────
# A lista espelha information_schema.columns medido no banco descartavel (14 colunas): a
# migration so aplica se as 12 colunas concedidas existirem, entao este fixture prova a lista.
# O grant de SELECT no nivel da TABELA reproduz a exposicao (default privileges do schema
# public no Supabase): sem ele o bug original nao existiria.
docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' >/dev/null
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $f$;

CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sync_status text NOT NULL DEFAULT 'pending',
  last_sync_at timestamptz,
  last_error text,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  access_token_encrypted bytea,
  refresh_token_encrypted bytea,
  history_id text,
  watch_expiration timestamptz
);

-- grant de TABELA medido no banco canonico (privilegio default de public): cobre TODAS as colunas.
GRANT SELECT ON public.gmail_accounts TO anon, authenticated, service_role;

CREATE VIEW public.gmail_accounts_safe WITH (security_invoker = on) AS
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts;

CREATE FUNCTION public.get_own_gmail_accounts()
RETURNS TABLE(
  id uuid, user_id uuid, email_address text, is_active boolean, sync_status text,
  last_sync_at timestamptz, last_error text, token_expires_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $f$
  SELECT id, user_id, email_address, is_active, sync_status,
         last_sync_at, last_error, token_expires_at, created_at, updated_at
  FROM public.gmail_accounts
  WHERE user_id = auth.uid() AND is_active = true;
$f$;
GRANT EXECUTE ON FUNCTION public.get_own_gmail_accounts() TO authenticated;
GRANT SELECT ON public.gmail_accounts_safe TO authenticated;

INSERT INTO public.gmail_accounts
  (user_id, email_address, access_token_encrypted, refresh_token_encrypted, history_id)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'a@exemplo.test', '\x00'::bytea, '\x00'::bytea, '1');
SQL
ok 'fixtures criadas (4 tabelas-objeto: gmail_accounts, view safe, RPC, auth.uid stub)'

# ── RED: sem a migration, o furo esta vivo (anon/authenticated LEEM os tokens) ────────────
for par in 'anon:access_token_encrypted' 'authenticated:refresh_token_encrypted'; do
  role="${par%%:*}"; col="${par##*:}"
  out="$(psql_role postgres "$role" "SELECT $col FROM public.gmail_accounts LIMIT 1;" 2>&1 || true)"
  if [[ "$out" == *'permission denied'* ]]; then
    fail "RED: $role ja estava bloqueado em $col antes da migration (fixture nao reproduz o furo)"
  fi
  ok "RED: $role LE $col antes da migration (furo reproduzido)"
done

# ── aplica a migration real (arquivo do repo) ─────────────────────────────────────────────
docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration" >/dev/null
ok 'migration real aplicada no banco descartavel'

# ── GREEN: os 5 cenarios do criterio de pronto ────────────────────────────────────────────
# Cenario 1: anon nao le access_token_encrypted
out="$(psql_role postgres anon 'SELECT access_token_encrypted FROM public.gmail_accounts LIMIT 1;' 2>&1 || true)"
[[ "$out" == *'permission denied'* ]] || fail "cenario 1: anon deveria falhar com permission denied, obteve: $out"
ok 'cenario 1: anon + SELECT access_token_encrypted -> permission denied'

# Cenario 2: authenticated nao le refresh_token_encrypted
out="$(psql_role postgres authenticated 'SELECT refresh_token_encrypted FROM public.gmail_accounts LIMIT 1;' 2>&1 || true)"
[[ "$out" == *'permission denied'* ]] || fail "cenario 2: authenticated deveria falhar com permission denied, obteve: $out"
ok 'cenario 2: authenticated + SELECT refresh_token_encrypted -> permission denied'

# Cenario 3: anon ainda le colunas nao-sensiveis
out="$(psql_role postgres anon 'SELECT id, email_address, is_active, history_id FROM public.gmail_accounts LIMIT 1;' 2>&1 || true)"
[[ "$out" != *'permission denied'* ]] || fail "cenario 3: anon deveria ler colunas nao-sensiveis, obteve: $out"
ok "cenario 3: anon + SELECT colunas nao-sensiveis -> ok"

# Cenario 4: get_own_gmail_accounts continua operando para authenticated
out="$(psql_role postgres authenticated 'SELECT count(*) FROM public.get_own_gmail_accounts();' 2>&1 || true)"
[[ "$out" == '1' ]] || fail "cenario 4: get_own_gmail_accounts deveria retornar 1, obteve: $out"
ok 'cenario 4: authenticated + count(*) FROM get_own_gmail_accounts() -> 1'

# Extra: a view security_invoker gmail_accounts_safe segue legivel (nao expoe tokens)
out="$(psql_role postgres authenticated 'SELECT count(*) FROM public.gmail_accounts_safe;' 2>&1 || true)"
[[ "$out" == '1' ]] || fail "extra: gmail_accounts_safe deveria seguir legivel, obteve: $out"
ok 'extra: authenticated + count(*) FROM gmail_accounts_safe -> 1 (view intacta)'

# Cenario 5: service_role (e o dono postgres) mantem SELECT nas colunas criptografadas
out="$(psql_db postgres "SELECT has_column_privilege('service_role','public.gmail_accounts','access_token_encrypted','SELECT');")"
[[ "$out" == 't' ]] || fail "cenario 5: service_role deveria manter SELECT em access_token_encrypted, obteve: $out"
out="$(psql_db postgres "SELECT has_column_privilege('service_role','public.gmail_accounts','refresh_token_encrypted','SELECT');")"
[[ "$out" == 't' ]] || fail "cenario 5: service_role deveria manter SELECT em refresh_token_encrypted, obteve: $out"
ok 'cenario 5: service_role mantem SELECT nas duas colunas criptografadas'

echo
printf 'Revogacao de token Gmail (%s assercoes, %s descartavel): OK.\n' "$passed" "$postgres_image"
