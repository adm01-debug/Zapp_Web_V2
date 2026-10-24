#!/usr/bin/env bash
# SEC-RLS_TAREFAS_EMAIL_LIGACOES-04 (P3) — as 3 policies "Block authenticated gmail
# inserts/updates/deletes" de public.gmail_accounts (20260404174826) foram criadas
# PERMISSIVAS: qualquer policy permissiva na tabela (hoje "Admins can insert/update/delete
# gmail accounts", 20260404162353) as anula, e authenticated escreve.
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito): migration ORIGINAL (permissivas) + 1 policy
#             permissiva de teste → INSERT/UPDATE/DELETE de authenticated PASSAM.
#   BLOCO B — migration nova aplicada: as 3 viram RESTRICTIVE; com a MESMA policy
#             permissiva de teste ainda presente, os 3 writes seguem barrados
#             (INSERT = 42501; UPDATE/DELETE = 0 linhas). service_role continua escrevendo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_old="$repo_root/supabase/migrations/20260404174826_2a7cc468-0dc4-44de-a806-6f28e4b7525f.sql"
migration_new="$repo_root/supabase/migrations/20261010113500_gmail_write_blocks_restrictive.sql"
postgres_image="${GMAIL_BLOCKS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-gmail-blocks-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-gmail-blocks-test-[0-9]+$ ]]; then
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
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

# Tenta INSERT, UPDATE e DELETE como authenticated (SET LOCAL ROLE, nunca superusuario) e
# imprime "RES|<op>|<resultado>": ok / SQLSTATE no INSERT; n.o de linhas afetadas no
# UPDATE/DELETE (barrado pela RLS = 0 linhas, sem erro).
writes_as_authenticated() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
DO $do$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO public.gmail_accounts (id, user_id, email)
    VALUES ('c0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'novo@example.com');
    RAISE NOTICE 'RES|INSERT|ok';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'RES|INSERT|%', SQLSTATE;
  END;
  UPDATE public.gmail_accounts SET email = 'alterado@example.com'
   WHERE id = 'c0000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'RES|UPDATE|%', n;
  DELETE FROM public.gmail_accounts WHERE id = 'c0000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'RES|DELETE|%', n;
END
$do$;
COMMIT;
SQL
}

expect_write() {
  local label="$1" op="$2" expected="$3" out="$4" got
  got="$(grep -o "RES|$op|[^ ]*" <<<"$out" | head -n1 | cut -d'|' -f3 || true)"
  [[ "$got" == "$expected" ]] || { printf '%s\n' "$out" >&2; fail "$label: esperado '$expected', obtido '${got:-<nada>}'"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_old" ]] || fail "migration original nao encontrada: $migration_old"
[[ -f "$migration_new" ]] || fail "migration nova nao encontrada: $migration_new"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Forma minima de public.gmail_accounts (20260403105341) com RLS ligada.
CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL
);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_accounts TO authenticated, service_role;

-- Policy permissiva de teste: o papel que, no historico, anulava os bloqueios
-- ("Admins can insert/update/delete gmail accounts", 20260404162353).
CREATE POLICY gmail_test_permissive ON public.gmail_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
TRUNCATE public.gmail_accounts;
INSERT INTO public.gmail_accounts (id, user_id, email)
VALUES ('c0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'conta@example.com');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'
psql_file "$migration_old" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null
expect_value 'A.0 as 3 policies de bloqueio existem, todas PERMISSIVAS' '3' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname LIKE 'Block authenticated gmail %' AND permissive='PERMISSIVE';"

out_a="$(writes_as_authenticated)"
expect_write 'A.1 (DEFEITO) INSERT de authenticated PASSA apesar do bloqueio' INSERT ok "$out_a"
expect_write 'A.2 (DEFEITO) UPDATE de authenticated afeta 1 linha' UPDATE 1 "$out_a"
expect_write 'A.3 (DEFEITO) DELETE de authenticated afeta 1 linha' DELETE 1 "$out_a"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration_new" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null
expect_value 'B.0 as 3 policies de bloqueio agora sao RESTRICTIVE' '3' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname LIKE 'Block authenticated gmail %' AND permissive='RESTRICTIVE' AND roles='{authenticated}';"
expect_value 'B.1 sem duplicata: 4 policies no total (3 bloqueios + a permissiva de teste)' '4' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts';"
expect_value 'B.2 a policy permissiva de teste continua presente' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts' AND policyname='gmail_test_permissive' AND permissive='PERMISSIVE';"

out_b="$(writes_as_authenticated)"
expect_write 'B.3 INSERT de authenticated barrado (42501) mesmo com policy permissiva' INSERT 42501 "$out_b"
expect_write 'B.4 UPDATE de authenticated afeta 0 linhas' UPDATE 0 "$out_b"
expect_write 'B.5 DELETE de authenticated afeta 0 linhas' DELETE 0 "$out_b"
expect_value 'B.6 a linha original segue intacta' 'conta@example.com' \
  "SELECT email FROM public.gmail_accounts WHERE id='c0000000-0000-0000-0000-0000000000a1';"
expect_value 'B.7 nenhuma linha nova entrou' '1' "SELECT count(*) FROM public.gmail_accounts;"

psql_sql "SET ROLE service_role; UPDATE public.gmail_accounts SET email='svc@example.com' WHERE id='c0000000-0000-0000-0000-0000000000a1'; RESET ROLE;" >/dev/null
expect_value 'B.8 service_role (BYPASSRLS) continua escrevendo' 'svc@example.com' \
  "SELECT email FROM public.gmail_accounts WHERE id='c0000000-0000-0000-0000-0000000000a1';"

# Idempotencia: reaplicar a migration nao pode falhar nem duplicar policy.
psql_file "$migration_new" >/dev/null
expect_value 'B.9 reaplicar a migration e idempotente (continuam 4 policies)' '4' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='gmail_accounts';"

printf '\nPASS: SEC-RLS-04 — bloqueios de escrita do gmail_accounts agora RESTRICTIVE: INSERT/UPDATE/DELETE de authenticated barrados mesmo com policy permissiva.\n'
