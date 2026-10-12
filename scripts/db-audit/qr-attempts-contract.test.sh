#!/usr/bin/env bash
# Cartão t_7af815d8 (área migrations) — tentativas de QR de pareamento.
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito): a tabela `public.qr_attempts` NÃO existe — não há
#             onde auditar um QR de conexão (scan, tentativas, motivo da falha) nem onde
#             fechar o ciclo do pareamento no banco.
#   BLOCO B — migration aplicada: a tabela nasce com o contrato do cartão (conexão/criado_em/
#             expira_em/status/motivo), FK com ON DELETE CASCADE, domínio fechado de status, RLS
#             LIGADA e fechada (staff lê/escreve; usuário comum e anon, nada), retenção de 30
#             dias por public.qr_attempts_purge() (só service_role).
#
# A migration real aplicada é supabase/migrations/20261012134705_qr_attempts.sql.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012134705_qr_attempts.sql"
postgres_image="${QR_ATTEMPTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-qr-attempts-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-qr-attempts-test-[0-9]+$ ]]; then
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
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
as_role() {
  local role="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; $sql"
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
expect_value_role() {
  local l="$1" e="$2" role="$3" s="$4" a
  a="$(as_role "$role" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_role() {
  local l="$1" needle="$2" role="$3" s="$4" out st
  set +e; out="$(as_role "$role" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
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
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Espelho do canônico: autorização é `user_roles` (a `profiles.role` é só espelho).
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
    );
  $function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- Alvo da FK: a tabela real de conexões (recorte mínimo, só o que a FK e a policy do cartão usam).
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'conexao',
  status text DEFAULT 'pendente'
);
GRANT SELECT ON public.whatsapp_connections TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.whatsapp_connections;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true); -- ADMIN (user_roles)
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent', true); -- AGENTE comum

INSERT INTO public.whatsapp_connections (id, name) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Conexao A'),
  ('c0000000-0000-0000-0000-000000000002', 'Conexao B');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ADM='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
AGENTE='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
CONN='c0000000-0000-0000-0000-000000000001'
CONN_DEL='c0000000-0000-0000-0000-000000000002'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'
expect_value 'A.1 (DEFEITO) public.qr_attempts NAO existe: nao ha onde auditar um QR' 'true' \
  "SELECT (to_regclass('public.qr_attempts') IS NULL)::text;"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null

expect_value 'B.1 a tabela nasceu' 'qr_attempts' "SELECT relname FROM pg_class WHERE oid = to_regclass('public.qr_attempts');"
expect_value 'B.2 contrato do cartao: conexao/criado_em/expira_em/status/motivo presentes' '5' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='qr_attempts'
     AND column_name IN ('connection_id','created_at','expires_at','status','reason');"
expect_value 'B.3 FK para whatsapp_connections' 'whatsapp_connections' \
  "SELECT c.confrelid::regclass::text FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public.qr_attempts') AND c.contype = 'f';"
expect_value 'B.4 a FK e ON DELETE CASCADE' 'c' \
  "SELECT c.confdeltype::text FROM pg_constraint c
     WHERE c.conrelid = to_regclass('public.qr_attempts') AND c.contype = 'f';"
expect_value 'B.5 connection_id e NOT NULL' 'true' \
  "SELECT attnotnull::text FROM pg_attribute WHERE attrelid = to_regclass('public.qr_attempts') AND attname='connection_id';"
expect_value 'B.6 RLS LIGADA na tabela nova' 'true' \
  "SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.qr_attempts');"

expect_error_role 'B.7 status fora do dominio e recusado' 'qr_attempts_status_check' postgres \
  "INSERT INTO public.qr_attempts (connection_id, expires_at, status) VALUES ('$CONN', now(), 'cancelado');"
psql_sql "INSERT INTO public.qr_attempts (connection_id, expires_at) VALUES ('$CONN', now() + interval '1 minute');" >/dev/null
expect_value 'B.8 status default e pendente' 'pendente' \
  "SELECT status FROM public.qr_attempts ORDER BY created_at DESC LIMIT 1;"
expect_value 'B.9 motivo (reason) aceita NULL' 'true' \
  "SELECT (reason IS NULL)::text FROM public.qr_attempts ORDER BY created_at DESC LIMIT 1;"
psql_sql "DELETE FROM public.qr_attempts;" >/dev/null

expect_ok_as 'B.10 staff (admin via user_roles) INSERE a tentativa' \
  "$ADM" "INSERT INTO public.qr_attempts (connection_id, expires_at, status, reason) VALUES ('$CONN', now() + interval '1 minute', 'pendente', NULL);"
expect_value_as 'B.11 staff LE a tentativa (RLS nao barra o dono do historico)' '1' \
  "$ADM" "SELECT count(*) FROM public.qr_attempts WHERE connection_id='$CONN';"
expect_value_as 'B.12 usuario comum NAO le nada (0 linhas)' '0' \
  "$AGENTE" "SELECT count(*) FROM public.qr_attempts;"
expect_error_as 'B.13 usuario comum NAO insere (RLS)' 'row-level security' "$AGENTE" \
  "INSERT INTO public.qr_attempts (connection_id, expires_at) VALUES ('$CONN', now() + interval '1 minute');"
expect_error_role 'B.14 anon NAO le (sem grant)' 'permission denied' anon \
  "SELECT count(*) FROM public.qr_attempts;"
expect_error_role 'B.15 anon NAO insere (sem grant)' 'permission denied' anon \
  "INSERT INTO public.qr_attempts (connection_id, expires_at) VALUES ('$CONN', now());"

expect_ok_as 'B.16 staff abre uma segunda tentativa para provar o CASCADE' \
  "$ADM" "INSERT INTO public.qr_attempts (connection_id, expires_at) VALUES ('$CONN_DEL', now() + interval '1 minute');"
expect_value 'B.17 a tentativa da Conexao B existe' '1' \
  "SELECT count(*) FROM public.qr_attempts WHERE connection_id='$CONN_DEL';"
psql_sql "DELETE FROM public.whatsapp_connections WHERE id='$CONN_DEL';" >/dev/null
expect_value 'B.18 CASCADE: apagar a conexao levou as tentativas dela' '0' \
  "SELECT count(*) FROM public.qr_attempts WHERE connection_id='$CONN_DEL';"

psql_sql "DELETE FROM public.qr_attempts;" >/dev/null
psql_sql "INSERT INTO public.qr_attempts (connection_id, created_at, expires_at, status) VALUES ('$CONN', now() - interval '31 days', now() - interval '30 days', 'expirado'), ('$CONN', now(), now() + interval '1 minute', 'pendente');" >/dev/null
expect_value 'B.19 antes da purga existem a antiga (31 dias) e a recente' '2' \
  "SELECT count(*) FROM public.qr_attempts;"
expect_value_role 'B.20 qr_attempts_purge() (service_role) remove so a de 31 dias' '1' \
  service_role "SELECT public.qr_attempts_purge();"
expect_value 'B.21 a recente sobreviveu (retencao e de 30 dias, nao de tudo)' '1' \
  "SELECT count(*) FROM public.qr_attempts;"
expect_error_as 'B.22 authenticated NAO executa a purga' 'permission denied' "$ADM" \
  "SELECT public.qr_attempts_purge();"
expect_error_role 'B.23 anon NAO executa a purga' 'permission denied' anon \
  "SELECT public.qr_attempts_purge();"

printf '\n============ BLOCO C — a linha -- Rollback: executa ============\n'
# Extrai os comandos da linha "-- Rollback (SQL executável, na ordem):" e os executa de verdade.
mapfile -t rollback_stmts < <(grep -E '^--   [a-z]+ .*;$' "$migration" | sed -E 's/^--   //')
[[ "${#rollback_stmts[@]}" -gt 0 ]] || fail "C.0 nenhuma instrucao de rollback encontrada em $migration"
for stmt in "${rollback_stmts[@]}"; do
  psql_sql "$stmt" >/dev/null || fail "C. rollback nao executou: $stmt"
done
expect_value 'C.1 apos o rollback a tabela sumiu' 'true' \
  "SELECT (to_regclass('public.qr_attempts') IS NULL)::text;"
expect_value 'C.2 apos o rollback a funcao de retencao sumiu' 'true' \
  "SELECT (to_regprocedure('public.qr_attempts_purge()') IS NULL)::text;"

printf '\nPASS: TC qr_attempts — tabela com contrato do cartao, FK CASCADE, dominio de status fechado, RLS staff-only (usuario comum e anon barrados), retencao de 30 dias so por service_role, e rollback executavel.\n'
