#!/usr/bin/env bash
# feat(db): auto-reconexao de conexoes WhatsApp (colunas por conexao + reconnection_logs).
#
# BLOCO A — estado ANTERIOR (defeito): sem a migration, a tabela public.reconnection_logs
#           nao existe, as colunas de politica de reconexao nao existem e a view operacional
#           whatsapp_connections_safe nao expoe health_reason.
# BLOCO B — migration aplicada: colunas com DEFAULT/limites reais; a view passa a expor
#           health_reason SEM perder o mascaramento de qr_code/instance_id; a tabela nova tem
#           RLS ligada (staff le, nao-staff nao ve a linha, anon sem grant, authenticated sem
#           INSERT/DELETE: o log nao se forja de dentro do app); ON DELETE CASCADE limpa o
#           historico; o comando de retencao AGENDADO (extraido do PROPRIO arquivo da migration)
#           apaga o que passou de 30 dias e preserva o recente; depois o ROLLBACK extraido do
#           arquivo desfaz tudo, e reaplicar (inclusive SEM pg_cron) e idempotente.
#
# Executa como os papeis reais (authenticated/anon/postgres); nunca como service_role no lugar
# do usuario. O unico stub e o esquema `cron`, que emula a interface minima do pg_cron
# (schedule/unschedule + cron.job) para provar o AGENDAMENTO sem depender da extensao.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012134000_auto_reconnect_logs.sql"
postgres_image="${AUTO_RECONNECT_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-auto-reconnect-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-auto-reconnect-test-[0-9]+$ ]]; then
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
  local role="$1" jwt="$2" sql="$3"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
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
expect_error_role() {
  local l="$1" needle="$2" role="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$role" "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_column_count() {
  local l="$1" e="$2" table="$3" col="$4" a
  a="$(psql_sql "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table' AND column_name = '$col';" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

STAFF="44444444-4444-4444-4444-444444444444"
OTHER="33333333-3333-3333-3333-333333333333"
CONN="aaaaaaaa-0000-0000-0000-0000000000c1"
JWT_STAFF='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
JWT_OTHER='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
JWT_ANON='{"role":"anon"}'

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

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id AND ur.role = _role
    );
  $function$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id AND ur.role = 'admin'
    );
  $function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id AND ur.role IN ('admin', 'supervisor')
    );
  $function$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Retrato minimo de whatsapp_connections com as colunas que a view operacional usa.
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_number text NOT NULL,
  instance_id text,
  status text,
  qr_code text,
  is_default boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  farewell_message text,
  farewell_enabled boolean,
  battery_level integer,
  is_plugged boolean,
  retry_count integer,
  max_retries integer,
  last_health_check timestamptz,
  health_status text,
  health_response_ms integer,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Retrato da view operacional ANTES da migration (sem health_reason).
CREATE OR REPLACE VIEW public.whatsapp_connections_safe
WITH (security_invoker = true) AS
SELECT
  id, name, phone_number, status, is_default,
  CASE WHEN public.has_role(auth.uid(), 'admin') THEN qr_code ELSE NULL END AS qr_code,
  CASE WHEN public.has_role(auth.uid(), 'admin') THEN instance_id ELSE NULL END AS instance_id,
  farewell_message, farewell_enabled, battery_level, is_plugged,
  retry_count, max_retries, last_health_check, health_status, health_response_ms,
  created_by, created_at, updated_at
FROM public.whatsapp_connections;

-- STUB do pg_cron: interface minima (schedule / unschedule / cron.job) para provar o
-- AGENDAMENTO da retencao em Postgres descartavel, que nao tem a extensao.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
CREATE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text) RETURNS bigint
  LANGUAGE plpgsql AS $fn$
  DECLARE j bigint;
  BEGIN
    INSERT INTO cron.job(jobname, schedule, command) VALUES (p_jobname, p_schedule, p_command)
      ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command
      RETURNING jobid INTO j;
    RETURN j;
  END $fn$;
CREATE FUNCTION cron.unschedule(p_jobid bigint) RETURNS boolean
  LANGUAGE plpgsql AS $fn$
  BEGIN
    DELETE FROM cron.job WHERE job.jobid = p_jobid;
    RETURN true;
  END $fn$;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# staff de verdade: STAFF e admin
psql_sql "INSERT INTO public.user_roles(user_id, role) VALUES ('$STAFF', 'admin');" >/dev/null
psql_sql "INSERT INTO public.whatsapp_connections(id, name, phone_number, instance_id, qr_code, status)
          VALUES ('$CONN', 'Conexao teste', '+5511999999999', 'inst-1', 'qr-payload', 'disconnected');" >/dev/null

# ---------- BLOCO A: sem a migration, o recurso esta ausente (vermelho) ----------
expect_value 'A1 sem a migration nao existe a tabela reconnection_logs' '0' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.reconnection_logs');"
expect_column_count 'A2 sem a migration nao existe auto_reconnect_enabled' '0' \
  'whatsapp_connections' 'auto_reconnect_enabled'
expect_column_count 'A3 sem a migration nao existe health_reason' '0' \
  'whatsapp_connections' 'health_reason'
expect_value 'A4 a view operacional existe (retrato anterior) sem health_reason' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'whatsapp_connections_safe' AND column_name = 'health_reason';"

# ---------- aplica a MIGRATION REAL ----------
psql_file "$migration" >/dev/null

# ---------- BLOCO B: contrato de acesso e limites ----------
expect_value 'B1 RLS ligada em reconnection_logs' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.reconnection_logs'::regclass;"
expect_value 'B2 indices por (connection_id, created_at) e por created_at' '2' \
  "SELECT count(*) FROM pg_indexes WHERE tablename = 'reconnection_logs' AND indexname IN ('reconnection_logs_connection_created_idx','reconnection_logs_created_at_idx');"

# a) defaults nas linhas existentes (colunas NOT NULL com DEFAULT = sem backfill)
expect_value 'B3 linha existente ficou com auto_reconnect_enabled = true' 't' \
  "SELECT auto_reconnect_enabled FROM public.whatsapp_connections WHERE id = '$CONN';"
expect_value 'B4 defaults 60s/3 tentativas na linha existente' '60|3' \
  "SELECT reconnect_interval_seconds || '|' || reconnect_max_attempts FROM public.whatsapp_connections WHERE id = '$CONN';"

# b) limites reais
expect_error 'B5 intervalo abaixo de 60s e recusado' 'check constraint' \
  "UPDATE public.whatsapp_connections SET reconnect_interval_seconds = 59 WHERE id = '$CONN';"
expect_error 'B6 intervalo acima de 3600s e recusado' 'check constraint' \
  "UPDATE public.whatsapp_connections SET reconnect_interval_seconds = 3601 WHERE id = '$CONN';"
# 60 e 3600 passam (o lote inteiro roda com ON_ERROR_STOP); o valor lido prova o limite de cima.
expect_value 'B7 intervalo aceita os extremos 60 e 3600' '3600' \
  "UPDATE public.whatsapp_connections SET reconnect_interval_seconds = 60 WHERE id = '$CONN';
   UPDATE public.whatsapp_connections SET reconnect_interval_seconds = 3600 WHERE id = '$CONN';
   SELECT reconnect_interval_seconds FROM public.whatsapp_connections WHERE id = '$CONN';"
expect_error 'B8 tentativas 0 e recusado' 'check constraint' \
  "UPDATE public.whatsapp_connections SET reconnect_max_attempts = 0 WHERE id = '$CONN';"
expect_error 'B9 tentativas 21 e recusado' 'check constraint' \
  "UPDATE public.whatsapp_connections SET reconnect_max_attempts = 21 WHERE id = '$CONN';"
expect_error 'B10 health_reason acima de 200 caracteres e recusado' 'check constraint' \
  "UPDATE public.whatsapp_connections SET health_reason = repeat('x', 201) WHERE id = '$CONN';"
expect_error 'B11 health_reason so espacos e recusado' 'check constraint' \
  "UPDATE public.whatsapp_connections SET health_reason = '   ' WHERE id = '$CONN';"
expect_value 'B12 health_reason aceita 200 caracteres' '200' \
  "UPDATE public.whatsapp_connections SET health_reason = repeat('x', 200) WHERE id = '$CONN';
   SELECT char_length(health_reason) FROM public.whatsapp_connections WHERE id = '$CONN';"

# c) a view operacional expoe health_reason e MANTEM o mascaramento
expect_column_count 'B13 a view operacional passou a expor health_reason' '1' \
  'whatsapp_connections_safe' 'health_reason'
expect_value 'B14 nao-admin ve qr_code mascarado (NULL) na view' '' \
  "SELECT set_config('request.jwt.claims', '$JWT_OTHER', false); SELECT coalesce(qr_code, '') FROM public.whatsapp_connections_safe WHERE id = '$CONN';"
expect_value 'B15 admin ve o qr_code real na view' 'qr-payload' \
  "SELECT set_config('request.jwt.claims', '$JWT_STAFF', false); SELECT qr_code FROM public.whatsapp_connections_safe WHERE id = '$CONN';"
expect_value 'B16 nao-admin ve instance_id mascarado (NULL) na view' '' \
  "SELECT set_config('request.jwt.claims', '$JWT_OTHER', false); SELECT coalesce(instance_id, '') FROM public.whatsapp_connections_safe WHERE id = '$CONN';"
expect_value 'B17 admin ve health_reason na view' '200' \
  "SELECT set_config('request.jwt.claims', '$JWT_STAFF', false); SELECT char_length(health_reason) FROM public.whatsapp_connections_safe WHERE id = '$CONN';"

# d) leitura do historico: staff ve, nao-staff nao ve, anon sem grant
psql_sql "INSERT INTO public.reconnection_logs(connection_id, attempt, result, reason)
          VALUES ('$CONN', 1, 'failure', 'instancia nao responde');" >/dev/null
expect_value_as 'B18 staff (admin) ve o historico da conexao' '1' "$JWT_STAFF" \
  "SELECT count(*) FROM public.reconnection_logs;"
expect_value_as 'B19 usuario nao-staff nao ve a linha (RLS filtra, nao so o grant)' '0' "$JWT_OTHER" \
  "SELECT count(*) FROM public.reconnection_logs;"
expect_value 'B20 a linha existe de fato (o 0 do nao-staff e a policy)' '1' \
  "SELECT count(*) FROM public.reconnection_logs;"
expect_error_role 'B21 anon nao le (sem grant)' 'permission denied' 'anon' "$JWT_ANON" \
  "SELECT count(*) FROM public.reconnection_logs;"

# e) escrita: o log nao se forja de dentro do app
expect_error_as 'B22 authenticated nao insere no historico' 'permission denied' "$JWT_STAFF" \
  "INSERT INTO public.reconnection_logs(connection_id, attempt, result) VALUES ('$CONN', 2, 'success');"
expect_error_as 'B23 authenticated nao apaga o historico' 'permission denied' "$JWT_STAFF" \
  "DELETE FROM public.reconnection_logs WHERE connection_id = '$CONN';"
expect_error_as 'B24 authenticated nao altera o historico' 'permission denied' "$JWT_STAFF" \
  "UPDATE public.reconnection_logs SET reason = 'hack' WHERE connection_id = '$CONN';"

# f) ACL explicita
expect_value 'B25 anon sem SELECT (grant)' 'f' \
  "SELECT has_table_privilege('anon', 'public.reconnection_logs', 'SELECT');"
expect_value 'B26 authenticated so com SELECT' '1' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'reconnection_logs' AND grantee = 'authenticated' AND privilege_type = 'SELECT';"
expect_value 'B27 authenticated sem INSERT/UPDATE/DELETE' '0' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'reconnection_logs' AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE');"
expect_value 'B28 service_role pode escrever o historico' '3' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'reconnection_logs' AND grantee = 'service_role' AND privilege_type IN ('SELECT','INSERT','DELETE');"
expect_value 'B29 PUBLIC sem grant' '0' \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_name = 'reconnection_logs' AND grantee = 'PUBLIC';"

# g) ON DELETE CASCADE: apagar a conexao limpa o historico
expect_value 'B30 apagar a conexao remove o historico (cascade)' '0' \
  "DELETE FROM public.whatsapp_connections WHERE id = '$CONN';
   SELECT count(*) FROM public.reconnection_logs WHERE connection_id = '$CONN';"

# h) retencao de 30 dias: o job foi agendado e o comando AGENDADO e o que apaga
expect_value 'B31 job de retencao agendado com a janela de 30 dias' '1' \
  "SELECT count(*) FROM cron.job WHERE jobname = 'reconnection-logs-retention-30d' AND command LIKE '%interval ''30 days''%';"
retention_sql="$(sed -n 's/.*\$job\$\(.*\)\$job\$.*/\1/p' "$migration" | head -n1)"
[[ -n "$retention_sql" ]] || fail 'comando de retencao nao extraido do arquivo da migration'
[[ "$retention_sql" == *"30 days"* ]] || fail "comando de retencao inesperado: $retention_sql"
psql_sql "INSERT INTO public.whatsapp_connections(id, name, phone_number) VALUES ('$CONN', 'Conexao teste', '+5511999999999');" >/dev/null
psql_sql "INSERT INTO public.reconnection_logs(connection_id, attempt, result, reason, created_at) VALUES
  ('$CONN', 1, 'failure', 'antiga (31 dias)', now() - interval '31 days'),
  ('$CONN', 2, 'failure', 'nova (1 dia)',      now() - interval '1 day');" >/dev/null
psql_sql "$retention_sql" >/dev/null
expect_value 'B32 o comando agendado apaga o que passou de 30 dias' '1' \
  "SELECT count(*) FROM public.reconnection_logs WHERE connection_id = '$CONN';"
expect_value 'B33 a linha recente sobreviveu a retencao' 'nova (1 dia)' \
  "SELECT reason FROM public.reconnection_logs WHERE connection_id = '$CONN';"

# ---------- ROLLBACK extraido do PROPRIO arquivo da migration ----------
sed -n '/^-- Rollback (SQL executável, na ordem):/,/^--$/p' "$migration" | grep '^--   ' | sed 's/^--   //' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'rollback nao extraido do arquivo da migration'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'B34 rollback removeu a tabela reconnection_logs' '0' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.reconnection_logs');"
expect_column_count 'B35 rollback removeu as colunas novas' '0' \
  'whatsapp_connections' 'health_reason'
expect_column_count 'B36 rollback removeu auto_reconnect_enabled' '0' \
  'whatsapp_connections' 'auto_reconnect_enabled'
expect_value 'B37 rollback removeu as 3 check constraints' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conname IN ('whatsapp_connections_reconnect_interval_seconds_check','whatsapp_connections_reconnect_max_attempts_check','whatsapp_connections_health_reason_check');"
expect_value 'B38 rollback restaurou a view sem health_reason' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'whatsapp_connections_safe' AND column_name = 'health_reason';"
expect_value 'B38b rollback restaura o GRANT da view para authenticated' 't' \
  "SELECT has_table_privilege('authenticated', 'public.whatsapp_connections_safe', 'SELECT');"
expect_value 'B39 rollback desagendou o job de retencao' '0' \
  "SELECT count(*) FROM cron.job WHERE jobname = 'reconnection-logs-retention-30d';"

# ---------- reaplica SEM pg_cron: a guarda evita falha e o recurso volta inteiro ----------
psql_sql 'DROP SCHEMA cron CASCADE;' >/dev/null
psql_file "$migration" >/dev/null
expect_value 'B40 reaplicar sem pg_cron nao falha e recria a tabela' '1' \
  "SELECT count(*) FROM pg_class WHERE oid = to_regclass('public.reconnection_logs');"
expect_column_count 'B41 reaplicar recria health_reason' '1' 'whatsapp_connections' 'health_reason'
expect_value 'B42 reaplicar religa a RLS' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.reconnection_logs'::regclass;"

printf '== TODOS OS PASSOS PASSARAM ==\n'
