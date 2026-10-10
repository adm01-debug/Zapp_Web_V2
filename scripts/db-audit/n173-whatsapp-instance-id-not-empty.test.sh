#!/usr/bin/env bash
set -Eeuo pipefail

# N-173: CHECK whatsapp_connections.instance_id nao aceita NULL nem vazio.
#
# O teste aplica a migration 20261010003940 num PostgreSQL 17 descartavel
# e prova:
#   BLOCO A — antes da migration: INSERT com NULL tem sucesso (defeito).
#   BLOCO B — migration aplicada: INSERT com NULL/''/'   ' falha com
#             check_violation; INSERT com valor valido tem sucesso.
#   BLOCO E — papel real (authenticated, padrao de enqueue-connection-scope):
#             o caminho normal do create-connection insere com instance_id
#             valido e tem NULL/'' rejeitados sob RLS+CHECK.
#   BLOCO C — ROLLBACK: executa a linha -- Rollback: do cabecalho da
#             migration e prova que a constraint foi removida (INSERT
#             com NULL volta a ter sucesso).
#   BLOCO D — re-aplica a migration e prova que a constraint volta.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010003940_n173_whatsapp_connections_instance_id_not_empty.sql"
postgres_image="${N173_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-n173-instance-id-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-n173-instance-id-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

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
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

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

# Prepara a superficie do banco: roles, schema auth, tabela whatsapp_connections
# na forma ANTERIOR a qualquer migration que adicione constraint.
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

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_number text NOT NULL,
  instance_id text,
  status text NOT NULL DEFAULT 'disconnected',
  qr_code text,
  is_default boolean DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- Superficie minima para o Bloco E (papel real): o caminho normal do
-- create-connection insere como authenticated sob RLS. Policy permissiva
-- de teste + GRANTs; a CHECK da migration continua sendo a barreira.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT, SELECT ON TABLE public.whatsapp_connections TO authenticated;
CREATE POLICY n173_test_insert_authenticated
  ON public.whatsapp_connections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY n173_test_select_authenticated
  ON public.whatsapp_connections FOR SELECT TO authenticated USING (true);
SQL

# Bloco A: ANTES da migration (o defeito) — so o bootstrap, sem a CHECK.
printf '%s\n' '--- Bloco A: ANTES da migration — INSERT com NULL tem sucesso (defeito) ---'
psql_file "$tmp_dir/pre.sql"

expect_value 'A1 sem a CHECK, INSERT com instance_id NULL tem sucesso (defeito presente)' '1' \
  "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-antes-null', '+5511999990000', NULL, 'disconnected') RETURNING 1;"

# Aplica a migration (a correcao), com ON_ERROR_STOP=1.
psql_file "$migration"

# Confirma que a CHECK NOT VALID existe no container antes dos INSERTs.
expect_value 'Constraint whatsapp_connections_instance_id_not_empty existe no pg_constraint' 't' \
  "SELECT COUNT(*) > 0 FROM pg_constraint WHERE conname = 'whatsapp_connections_instance_id_not_empty' AND conrelid = 'public.whatsapp_connections'::regclass;"

# Bloco B: migration aplicada — INSERT com NULL/''/'   ' deve falhar.
printf '%s\n' '--- Bloco B: CHECK ativo — insercao invalidas devem falhar ---'

expect_error 'INSERT com instance_id NULL eh rejeitado' 'violates check constraint' \
  "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-null', '+5511000000001', NULL, 'disconnected');"

expect_error 'INSERT com instance_id vazio eh rejeitado' 'violates check constraint' \
  "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-empty', '+5511000000002', '', 'disconnected');"

expect_error 'INSERT com instance_id so espacos eh rejeitado' 'violates check constraint' \
  "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-spaces', '+5511000000003', '   ', 'disconnected');"

# Valor valido deve ter sucesso.
expect_value 'INSERT com instance_id valido tem sucesso' '1' \
  "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-valid', '+551****0004', 'instance-abc', 'disconnected') RETURNING 1;"

# Bloco E: papel real — o caminho normal do create-connection
# (supabase/functions/evolution-api/index.ts:328 insere instance_id valido)
# roda como authenticated sob RLS; NULL/'' continuam rejeitados pela CHECK.
printf '%s\n' '--- Bloco E: papel real (authenticated) — valido insere, NULL/vazio falham ---'

AUTH_CLAIM='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'

expect_value 'E1 authenticated insere instance_id valido (caminho do create-connection)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$AUTH_CLAIM',false); INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-auth-valid', '+5511999990007', 'instance-auth-abc', 'disconnected') RETURNING 1;"

expect_value 'E1s authenticated lista a linha inserida (caminho .select().single() do create-connection)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$AUTH_CLAIM',false); SELECT COUNT(*) FROM public.whatsapp_connections WHERE instance_id = 'instance-auth-abc';"

expect_error 'E2 authenticated com instance_id NULL eh rejeitado' 'violates check constraint' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$AUTH_CLAIM',false); INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-auth-null', '+5511999990008', NULL, 'disconnected');"

expect_error 'E3 authenticated com instance_id vazio eh rejeitado' 'violates check constraint' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$AUTH_CLAIM',false); INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-auth-empty', '+5511999990009', '', 'disconnected');"

# Bloco C: ROLLBACK — executa a linha -- Rollback: do cabecalho da migration.
printf '%s\n' '--- Bloco C: ROLLBACK — constraint removida, insercao com NULL volta a ter sucesso ---'

rollback_sql="$(grep '^-- Rollback:' "$migration" | sed 's/^-- Rollback: //')"
[[ -n "$rollback_sql" ]] || fail "Linha -- Rollback: nao encontrada em $migration."

psql_sql "$rollback_sql"

expect_value 'Apos rollback, INSERT com instance_id NULL tem sucesso (constraint removida)' '1' \
  "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-rollback-null', '+5511000000005', NULL, 'disconnected') RETURNING 1;"

# Bloco D: re-aplica a migration e prova que a constraint volta.
printf '%s\n' '--- Bloco D: re-aplicacao — constraint volta a bloquear NULL ---'

psql_file "$migration"

expect_error 'Apos re-aplicacao, INSERT com instance_id NULL eh rejeitado novamente' 'violates check constraint' \
  "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('test-readded-null', '+5511000000006', NULL, 'disconnected');"

printf 'OK: N-173 CHECK whatsapp_connections.instance_id NOT VALID validado em PostgreSQL 17 descartavel.\n'
