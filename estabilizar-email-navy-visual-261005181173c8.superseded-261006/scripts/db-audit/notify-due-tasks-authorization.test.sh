#!/usr/bin/env bash
# Contrato de autorizacao do notify_due_tasks() — a unica RPC SECURITY DEFINER de
# escrita ainda sem guarda de papel (auditoria de 30/09).
#
# BLOCO A (antes): authenticated dispara a varredura global e cria notificacao para
#   terceiro + consome o notified_at alheio (defeito).
# BLOCO B (depois): authenticated -> 42501 service_role_required; service_role e o
#   cron (session_user=postgres, sem JWT) seguem executando.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql"
postgres_image="${NOTIFY_DUE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-notify-due-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-notify-due-test-[0-9]+$ ]]; then
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

CREATE FUNCTION public.is_privileged_contact_caller() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT coalesce(auth.role(), session_user) = ANY (ARRAY['service_role','postgres','supabase_admin']) $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.conversation_tasks (
  id uuid PRIMARY KEY, title text NOT NULL, created_by uuid NOT NULL REFERENCES public.profiles(id),
  contact_id uuid, remind_at timestamptz NOT NULL, notified_at timestamptz, status text NOT NULL DEFAULT 'open'
);
CREATE TABLE public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL,
  title text, message text, type text, metadata jsonb
);

-- Corpo ATUAL de producao (sem guarda) — o defeito.
CREATE OR REPLACE FUNCTION public.notify_due_tasks()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer := 0; v_task record;
BEGIN
  FOR v_task IN
    SELECT t.id, t.title, t.created_by, t.contact_id, t.remind_at, p.user_id
    FROM public.conversation_tasks t JOIN public.profiles p ON p.id = t.created_by
    WHERE t.remind_at <= now() AND t.notified_at IS NULL AND t.status NOT IN ('done','cancelled')
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (v_task.user_id, 'Lembrete: ' || v_task.title, 'x', 'reminder_due', '{}'::jsonb);
    UPDATE public.conversation_tasks SET notified_at = now() WHERE id = v_task.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_due_tasks() TO authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.notifications;
DELETE FROM public.conversation_tasks;
DELETE FROM public.profiles;
INSERT INTO public.profiles (id, user_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.conversation_tasks (id, title, created_by, remind_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'tarefa vencida do BRUNO', 'b0000000-0000-0000-0000-000000000001', now() - interval '1 hour');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ALICE="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"

echo '── BLOCO A: ANTES da migration (o defeito) ────────────────────────────────────────'

expect_value 'A1 ALICE (authenticated) dispara a varredura global e o retorno é 1' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT public.notify_due_tasks();" 
expect_value 'A2 criou notificacao para BRUNO (terceiro)' '1' \
  "SELECT count(*) FROM public.notifications WHERE user_id='22222222-2222-2222-2222-222222222222'"
expect_value 'A3 consumiu o notified_at da tarefa de BRUNO' '1' \
  "SELECT count(*) FROM public.conversation_tasks WHERE notified_at IS NOT NULL"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: DEPOIS da migration ───────────────────────────────────────────────────'

expect_error 'B1 authenticated é recusado (42501 service_role_required)' \
  'service_role_required' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT public.notify_due_tasks();"
expect_value 'B2 nada foi gravado pelo authenticated' '0' \
  "SELECT count(*) FROM public.notifications"

expect_value 'B3 service_role segue executando (cron via gateway)' '1' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); SELECT public.notify_due_tasks();"
expect_value 'B4 service_role gravou a notificacao do BRUNO' '1' \
  "SELECT count(*) FROM public.notifications WHERE user_id='22222222-2222-2222-2222-222222222222'"

psql_file "$tmp_dir/seed.sql"
expect_value 'B5 cron direto (postgres, sem JWT) segue executando' '1' \
  "SELECT public.notify_due_tasks();"
expect_value 'B6 e gravou (session_user=postgres passa)' '1' \
  "SELECT count(*) FROM public.notifications"

printf '\n[OK] contrato de autorizacao do notify_due_tasks verificado\n'
