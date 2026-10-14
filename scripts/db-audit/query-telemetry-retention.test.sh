#!/usr/bin/env bash
# Prova em PG 17 descartavel (docker local) da limpeza de telemetria:
#   BLOCO A — estado ANTERIOR (defeito):
#             * a policy de DELETE em public.query_telemetry e is_admin_or_supervisor
#               -> SUPERVISOR apaga telemetria direto, sem deixar rastro em audit_logs;
#             * nao existe RPC de limpeza auditada.
#   BLOCO B — migration aplicada:
#             * DELETE direto passa a ser SO de admin (supervisor e agente nao apagam nada);
#             * RPC clear_old_telemetry(integer) e SO de admin: apaga o que venceu, grava em
#               audit_logs (quem, quantas linhas) e devolve a contagem, numa transacao so;
#             * retencao automatica: job pg_cron diario chama a RPC interna, que apaga > 30 d
#               e audita com source='cron';
#             * entrada invalida recusa sem apagar; reexecutar apaga 0;
#             * rollback do cabecalho devolve a policy antiga (supervisor volta a apagar) e
#               remove funcoes e agenda.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261014120646_query_telemetry_retencao.sql"
postgres_image="${QUERY_TELEMETRY_RETENTION_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-query-telemetry-retention-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-query-telemetry-retention-test-[0-9]+$ ]]; then
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

-- public.user_roles + is_admin/js (forma canonica anterior)
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role) $function$;
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')) $function$;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- public.audit_logs (forma ANTERIOR, fiel a 20251215025014)
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- public.query_telemetry (forma ANTERIOR, fiel a 20260323120607)
CREATE TABLE public.query_telemetry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation text NOT NULL DEFAULT 'select',
  table_name text,
  rpc_name text,
  duration_ms integer NOT NULL DEFAULT 0,
  record_count integer,
  query_limit integer,
  query_offset integer,
  count_mode text,
  severity text NOT NULL DEFAULT 'normal',
  error_message text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.query_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read telemetry" ON public.query_telemetry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert telemetry" ON public.query_telemetry FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can delete telemetry" ON public.query_telemetry FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- GRANTs de tabela como o ambiente Supabase concede por padrao no schema public
GRANT SELECT, INSERT, UPDATE, DELETE ON public.query_telemetry TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- pg_cron (mesma API que a migration usa)
CREATE SCHEMA cron;
CREATE TABLE cron.job (
  jobid bigserial PRIMARY KEY,
  jobname text NOT NULL UNIQUE,
  schedule text NOT NULL,
  command text NOT NULL
);
CREATE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text) RETURNS bigint
LANGUAGE plpgsql AS $function$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cron.job(jobname, schedule, command) VALUES (p_name, p_schedule, p_command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_id;
  RETURN v_id;
END; $function$;
CREATE FUNCTION cron.unschedule(p_name text) RETURNS boolean
LANGUAGE plpgsql AS $function$
BEGIN DELETE FROM cron.job WHERE jobname = p_name; RETURN true; END; $function$;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
TRUNCATE public.query_telemetry;
DELETE FROM public.audit_logs;
DELETE FROM public.user_roles;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('66666666-6666-6666-6666-666666666666', 'admin'),
  ('55555555-5555-5555-5555-555555555555', 'supervisor'),
  ('11111111-1111-1111-1111-111111111111', 'agent');

INSERT INTO public.query_telemetry (id, severity, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'normal', now() - interval '100 days'),
  ('c0000000-0000-0000-0000-000000000002', 'normal', now() - interval '45 days'),
  ('c0000000-0000-0000-0000-000000000003', 'normal', now() - interval '5 days'),
  ('c0000000-0000-0000-0000-000000000006', 'normal', now() - interval '2 days');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ADM='{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}'
SUP='{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}'
AGT='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'

T_OLD='c0000000-0000-0000-0000-000000000001'
T_OLD2='c0000000-0000-0000-0000-000000000002'
T_REC='c0000000-0000-0000-0000-000000000003'
T_DIR='c0000000-0000-0000-0000-000000000006'
P_USER='66666666-6666-6666-6666-666666666666'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_ok_as 'A.1 agente tenta DELETE direto (nenhuma linha apagada)' \
  "$AGT" "DELETE FROM public.query_telemetry WHERE id='$T_OLD';"
expect_value 'A.1b a linha continua la depois da tentativa do agente' '1' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='$T_OLD';"

expect_ok_as 'A.2 (DEFEITO) supervisor apaga telemetria direto, sem auditoria' \
  "$SUP" "DELETE FROM public.query_telemetry WHERE id='$T_OLD';"
expect_value 'A.3 (DEFEITO) a linha antiga do supervisor sumiu' '0' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='$T_OLD';"
expect_value 'A.4 (DEFEITO) a limpeza nao deixou rastro em audit_logs' '0' \
  "SELECT count(*) FROM public.audit_logs WHERE action='query_telemetry.retention';"
expect_value 'A.5 (DEFEITO) nao existe RPC de limpeza auditada' 'null' \
  "SELECT coalesce(to_regprocedure('public.clear_old_telemetry(integer)')::text, 'null');"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_ok_as 'B.1 supervisor tenta DELETE direto (RLS agora filtra)' \
  "$SUP" "DELETE FROM public.query_telemetry WHERE id='$T_OLD';"
expect_value 'B.2 a linha antiga do supervisor CONTINUA (supervisor nao apaga mais)' '1' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='$T_OLD';"
expect_ok_as 'B.3 agente tenta DELETE direto (idem)' \
  "$AGT" "DELETE FROM public.query_telemetry WHERE id='$T_REC';"
expect_value 'B.4 a linha recente do agente CONTINUA' '1' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='$T_REC';"

expect_ok_as 'B.5 controle: admin AINDA apaga direto pela policy' \
  "$ADM" "DELETE FROM public.query_telemetry WHERE id='$T_DIR';"
expect_value 'B.6 ...e a linha do admin sumiu (DELETE direto permitido a admin)' '0' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='$T_DIR';"

expect_value 'B.7 a RPC clear_old_telemetry(integer) existe' 't' \
  "SELECT to_regprocedure('public.clear_old_telemetry(integer)') is not null;"
expect_value 'B.8 anon nao tem EXECUTE na RPC' 'f' \
  "SELECT has_function_privilege('anon','public.clear_old_telemetry(integer)','EXECUTE');"
expect_error_as 'B.9 supervisor nao limpa pela RPC (mesma resposta de quem nao pode)' \
  'not_authorized' "$SUP" "SELECT public.clear_old_telemetry(30);"
expect_error_as 'B.10 agente nao limpa pela RPC' \
  'not_authorized' "$AGT" "SELECT public.clear_old_telemetry(30);"
expect_value 'B.11 nada foi apagado pelas tentativas negadas' '3' \
  "SELECT count(*) FROM public.query_telemetry;"

expect_value_as 'B.12 admin limpa >30d pela RPC e recebe a contagem exata' '2' "$ADM" \
  "SELECT public.clear_old_telemetry(30);"
expect_value 'B.13 so o que venceu saiu (recente de 5 d continua)' '1' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='$T_REC';"
expect_value 'B.14 as duas vencidas (100 d e 45 d) sairam' '0' \
  "SELECT count(*) FROM public.query_telemetry WHERE id IN ('$T_OLD','$T_OLD2');"
expect_value 'B.15 a limpeza ficou auditada (1 linha, do admin, com a contagem e a origem)' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action='query_telemetry.retention' AND user_id='$P_USER' AND (details->>'deleted_count')='2' AND (details->>'source')='manual';"

expect_value_as 'B.16 reexecutar nao apaga nada (idempotente)' '0' "$ADM" \
  "SELECT public.clear_old_telemetry(30);"
expect_error_as 'B.17 entrada invalida (0 dias) recusa' \
  'invalid_retention_days' "$ADM" "SELECT public.clear_old_telemetry(0);"
expect_error_as 'B.18 entrada invalida (NULL) recusa' \
  'invalid_retention_days' "$ADM" "SELECT public.clear_old_telemetry(NULL);"
expect_error_as 'B.19 entrada invalida (-1) recusa' \
  'invalid_retention_days' "$ADM" "SELECT public.clear_old_telemetry(-1);"
expect_value 'B.20 a recusa de entrada invalida nao apagou nem auditou nada' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action='query_telemetry.retention' AND (details->>'deleted_count')='2';"

expect_value 'B.21 o job diario de retencao foi agendado no pg_cron' '1' \
  "SELECT count(*) FROM cron.job WHERE jobname='query-telemetry-retention' AND command ILIKE '%query_telemetry_retention_tick%';"
expect_value 'B.22 o job roda 1x/dia e nao a cada minuto' '45 4 * * *' \
  "SELECT schedule FROM cron.job WHERE jobname='query-telemetry-retention';"

psql_sql "INSERT INTO public.query_telemetry (id, severity, created_at) VALUES ('c0000000-0000-0000-0000-000000000004','normal', now() - interval '60 days');" >/dev/null
expect_value 'B.23 a retencao automatica (tick) apaga o que passou de 30 d' '1' \
  "SELECT public.query_telemetry_retention_tick();"
expect_value 'B.24 o tick auditou a limpeza automatica (origem cron, sem usuario)' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action='query_telemetry.retention' AND user_id IS NULL AND (details->>'source')='cron' AND (details->>'deleted_count')='1';"

psql_sql "INSERT INTO public.query_telemetry (id, severity, created_at) VALUES ('c0000000-0000-0000-0000-000000000005','normal', now() - interval '70 days');" >/dev/null
cat > "$tmp_dir/falha.sql" <<'SQL'
CREATE OR REPLACE FUNCTION public.zz_forca_falha_auditoria() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.entity_type = 'query_telemetry' THEN
    RAISE EXCEPTION 'falha_forcada_auditoria';
  END IF;
  RETURN NEW;
END; $function$;
CREATE TRIGGER zz_forca_falha_auditoria BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.zz_forca_falha_auditoria();
SQL
psql_file "$tmp_dir/falha.sql" >/dev/null
set +e; out="$(psql_sql "SELECT public.query_telemetry_retention_tick();" 2>&1)"; st=$?; set -e
(( st == 0 )) && fail "B.25 deveria falhar com a auditoria forçada a falhar"
[[ "$out" == *"falha_forcada_auditoria"* ]] || fail "B.25 esperava falha_forcada_auditoria, veio: $out"
printf '[PASS] %s\n' 'B.25 a auditoria falha aborta o tick'
expect_value 'B.26 atomicidade: o DELETE desfez junto (a linha de 70 d continua)' '1' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='c0000000-0000-0000-0000-000000000005';"
psql_sql "DROP TRIGGER zz_forca_falha_auditoria ON public.audit_logs; DROP FUNCTION public.zz_forca_falha_auditoria();" >/dev/null

printf '\n============ BLOCO C — rollback do cabecalho ============\n'
awk '/^-- Rollback \(SQL execut.*vel, na ordem\):/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'C.1 nao consegui extrair o rollback do cabecalho'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'C.1 a RPC sumiu no rollback' 'null' \
  "SELECT coalesce(to_regprocedure('public.clear_old_telemetry(integer)')::text, 'null');"
expect_value 'C.2 a agenda do pg_cron saiu no rollback' '0' \
  "SELECT count(*) FROM cron.job WHERE jobname='query-telemetry-retention';"
psql_sql "INSERT INTO public.query_telemetry (id, severity, created_at) VALUES ('c0000000-0000-0000-0000-000000000001','normal', now() - interval '100 days');" >/dev/null
expect_ok_as 'C.3 supervisor volta a apagar pela policy ANTIGA' \
  "$SUP" "DELETE FROM public.query_telemetry WHERE id='$T_OLD';"
expect_value 'C.4 ...e a linha antiga sumiu de novo (estado anterior restaurado)' '0' \
  "SELECT count(*) FROM public.query_telemetry WHERE id='$T_OLD';"

printf '\nPASS: query_telemetry — DELETE so para admin, RPC de limpeza auditada (quem+contagem), retencao diaria 30 d e rollback que devolve o estado anterior.\n'
