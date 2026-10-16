#!/usr/bin/env bash
# E44 (inventario F6, PLANO_MULTI_CONEXAO_EVOLUTION_GO_50_ETAPAS_2026-09-25.md):
# "anon" tinha concessao viva ALL em public.whatsapp_connections e SELECT nas 3
# views security_invoker (whatsapp_connections_safe/_agent/_public), e
# "authenticated" tinha TRUNCATE/TRIGGER/REFERENCES na tabela — privilegios que
# NAO passam por RLS (TRUNCATE apaga a tabela inteira sem consultar policy).
#
# Roda em Postgres descartavel, com os papeis reais (anon/authenticated/
# service_role), o estado de ACL MEDIDO no banco local da tarefa em 2026-10-08
# (anon=arwdDxtm, authenticated=arwdDxtm nas 4 relacoes) e as definicoes reais
# de tabela, views e policies:
#   BLOCO A — defeito: grants presentes; anon TRUNCATE e authenticated cria
#             TRIGGER funcionam (privilegio fora da RLS).
#   BLOCO B — migration real aplicada (psql -f do arquivo): anon perde tudo na
#             tabela e SELECT nas 3 views; authenticated perde SO os 3
#             privilegios; leitura logada das views segue funcionando.
#   BLOCO C — a linha "-- Rollback:" do proprio arquivo e executada e devolve o
#             estado anterior; reaplicar a migration volta a revogar.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009000118_revoke_whatsapp_connections_anon_grants.sql"
postgres_image="${E44_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-e44-grants-test-$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-e44-grants-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; ((passed += 1)); }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
# Executa como o PAPEL real (nunca como postgres: superusuario ignora GRANT/RLS).
as_role() {
  local role="$1" jwt="$2" sql="$3"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_ok_role() {
  local l="$1" r="$2" j="$3" s="$4"
  as_role "$r" "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como $r)"
  pass "$l"
}
expect_value_role() {
  local l="$1" e="$2" r="$3" j="$4" s="$5" a
  a="$(as_role "$r" "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_error_role() {
  local l="$1" needle="$2" r="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$r" "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
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
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role / is_admin_or_supervisor nas definicoes REAIS (20251215025014 / live).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$function$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  status text,
  phone_number text,
  is_default boolean DEFAULT false,
  qr_code text,
  instance_id text,
  farewell_message text,
  farewell_enabled boolean DEFAULT false,
  battery_level integer,
  is_plugged boolean,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 0,
  last_health_check timestamptz,
  health_status text,
  health_response_ms integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Views com as definicoes REAIS (security_invoker, como no banco da tarefa).
CREATE VIEW public.whatsapp_connections_public
WITH (security_invoker = true) AS
SELECT id, name, status, is_default FROM public.whatsapp_connections;

CREATE VIEW public.whatsapp_connections_agent
WITH (security_invoker = true) AS
SELECT id, name, status, phone_number, is_default FROM public.whatsapp_connections;

CREATE VIEW public.whatsapp_connections_safe
WITH (security_invoker = true) AS
SELECT
  id, name, phone_number, status, is_default,
  CASE WHEN public.has_role(auth.uid(), 'admin') THEN qr_code ELSE NULL END AS qr_code,
  CASE WHEN public.has_role(auth.uid(), 'admin') THEN instance_id ELSE NULL END AS instance_id,
  farewell_message, farewell_enabled, battery_level, is_plugged,
  retry_count, max_retries, last_health_check, health_status, health_response_ms,
  created_by, created_at, updated_at
FROM public.whatsapp_connections;

-- RLS real da tabela: so admin/supervisor (user_roles) ve e grava.
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin supervisor view connections" ON public.whatsapp_connections
  FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can insert connections" ON public.whatsapp_connections
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can update connections" ON public.whatsapp_connections
  FOR UPDATE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections
  FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));

CREATE FUNCTION public._e44_noop_trigger() RETURNS trigger
  LANGUAGE plpgsql AS $function$ BEGIN RETURN NEW; END $function$;
GRANT EXECUTE ON FUNCTION public._e44_noop_trigger() TO authenticated;

-- Concessao viva MEDIDA no banco local da tarefa (2026-10-08): os tres papeis
-- tinham ALL (arwdDxtm) na tabela e nas 3 views.
GRANT ALL ON public.whatsapp_connections TO anon, authenticated, service_role;
GRANT ALL ON public.whatsapp_connections_safe, public.whatsapp_connections_agent,
            public.whatsapp_connections_public TO anon, authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.whatsapp_connections;
DELETE FROM public.user_roles;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('66666666-6666-6666-6666-666666666666', 'admin'::public.app_role);
INSERT INTO public.whatsapp_connections (id, name, status, is_default, qr_code, instance_id)
VALUES ('c0000000-0000-0000-0000-000000000001', 'Conexao 1', 'connected', true, 'QR', 'inst-1');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ADM='{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}'
AGT='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
ANON='{"role":"anon"}'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value 'A.1 (DEFEITO) anon tem SELECT na tabela' 't' \
  "SELECT has_table_privilege('anon','public.whatsapp_connections','SELECT');"
expect_value 'A.2 (DEFEITO) anon tem SELECT nas 3 views' 't|t|t' \
  "SELECT string_agg(CASE WHEN v THEN 't' ELSE 'f' END,'|') FROM (VALUES
     (has_table_privilege('anon','public.whatsapp_connections_safe','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections_agent','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections_public','SELECT'))) s(v);"
expect_value 'A.3 (DEFEITO) authenticated tem TRUNCATE/TRIGGER/REFERENCES (fora da RLS)' 't|t|t' \
  "SELECT string_agg(CASE WHEN v THEN 't' ELSE 'f' END,'|') FROM (VALUES
     (has_table_privilege('authenticated','public.whatsapp_connections','TRUNCATE')),
     (has_table_privilege('authenticated','public.whatsapp_connections','TRIGGER')),
     (has_table_privilege('authenticated','public.whatsapp_connections','REFERENCES'))) s(v);"

expect_ok_role 'A.4 (DEFEITO) anon TRUNCA a tabela inteira — TRUNCATE nao consulta RLS' \
  'anon' "$ANON" "TRUNCATE public.whatsapp_connections;"
expect_value 'A.5 tabela ficou vazia pelo TRUNCATE do anon' '0' \
  "SELECT count(*) FROM public.whatsapp_connections;"
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_ok_role 'A.6 (DEFEITO) authenticated cria TRIGGER na tabela (privilegio fora da RLS)' \
  'authenticated' "$ADM" \
  "CREATE TRIGGER e44_probe BEFORE INSERT ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public._e44_noop_trigger();"
psql_sql "DROP TRIGGER e44_probe ON public.whatsapp_connections;" >/dev/null

printf '\n============ BLOCO B — migration real aplicada ============\n'
psql_file "$migration" >/dev/null

expect_value 'B.1 anon perdeu TODOS os privilegios na tabela' 'f|f|f|f|f|f|f' \
  "SELECT string_agg(CASE WHEN v THEN 't' ELSE 'f' END,'|') FROM (VALUES
     (has_table_privilege('anon','public.whatsapp_connections','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections','INSERT')),
     (has_table_privilege('anon','public.whatsapp_connections','UPDATE')),
     (has_table_privilege('anon','public.whatsapp_connections','DELETE')),
     (has_table_privilege('anon','public.whatsapp_connections','TRUNCATE')),
     (has_table_privilege('anon','public.whatsapp_connections','REFERENCES')),
     (has_table_privilege('anon','public.whatsapp_connections','TRIGGER'))) s(v);"
expect_value 'B.2 anon perdeu SELECT nas 3 views' 'f|f|f' \
  "SELECT string_agg(CASE WHEN v THEN 't' ELSE 'f' END,'|') FROM (VALUES
     (has_table_privilege('anon','public.whatsapp_connections_safe','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections_agent','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections_public','SELECT'))) s(v);"
expect_value 'B.3 authenticated: unica diferenca sao os 3 revogados (resta S,I,U,D)' \
  'DELETE|INSERT|SELECT|UPDATE' \
  "SELECT string_agg(privilege_type,'|' ORDER BY privilege_type)
     FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='whatsapp_connections' AND grantee='authenticated';"

expect_error_role 'B.4 anon nao le a tabela (permission denied, papel real)' \
  'permission denied' 'anon' "$ANON" "SELECT count(*) FROM public.whatsapp_connections;"
expect_error_role 'B.5 anon nao le a view safe' \
  'permission denied' 'anon' "$ANON" "SELECT count(*) FROM public.whatsapp_connections_safe;"
expect_error_role 'B.6 anon nao le a view agent' \
  'permission denied' 'anon' "$ANON" "SELECT count(*) FROM public.whatsapp_connections_agent;"
expect_error_role 'B.7 anon nao le a view public' \
  'permission denied' 'anon' "$ANON" "SELECT count(*) FROM public.whatsapp_connections_public;"
expect_error_role 'B.8 anon nao TRUNCA mais' \
  'permission denied' 'anon' "$ANON" "TRUNCATE public.whatsapp_connections;"
expect_error_role 'B.9 authenticated nao TRUNCA mais' \
  'permission denied' 'authenticated' "$ADM" "TRUNCATE public.whatsapp_connections;"
expect_error_role 'B.10 authenticated nao cria TRIGGER mais' \
  'permission denied' 'authenticated' "$ADM" \
  "CREATE TRIGGER e44_probe BEFORE INSERT ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION public._e44_noop_trigger();"
expect_value 'B.11 a linha sobreviveu as tentativas de TRUNCATE' '1' \
  "SELECT count(*) FROM public.whatsapp_connections;"

expect_value_role 'B.12 fluxo logado: admin le a view safe (RLS + grant intactos)' '1' \
  'authenticated' "$ADM" "SELECT count(*) FROM public.whatsapp_connections_safe;"
expect_value_role 'B.13 fluxo logado: admin le a view agent' '1' \
  'authenticated' "$ADM" "SELECT count(*) FROM public.whatsapp_connections_agent;"
expect_value_role 'B.14 fluxo logado: admin le a view public' '1' \
  'authenticated' "$ADM" "SELECT count(*) FROM public.whatsapp_connections_public;"
expect_value_role 'B.15 qr_code chega ao admin pela view safe' 'QR' \
  'authenticated' "$ADM" "SELECT qr_code FROM public.whatsapp_connections_safe;"
expect_value_role 'B.16 agente comum executa a view sem erro (RLS filtra, grant serve)' '0' \
  'authenticated' "$AGT" "SELECT count(*) FROM public.whatsapp_connections_safe;"

expect_value 'B.17 service_role continua com ALL na tabela (nada afrouxado nem apertado)' 't' \
  "SELECT bool_and(v) FROM (VALUES
     (has_table_privilege('service_role','public.whatsapp_connections','SELECT')),
     (has_table_privilege('service_role','public.whatsapp_connections','INSERT')),
     (has_table_privilege('service_role','public.whatsapp_connections','UPDATE')),
     (has_table_privilege('service_role','public.whatsapp_connections','DELETE')),
     (has_table_privilege('service_role','public.whatsapp_connections','TRUNCATE')),
     (has_table_privilege('service_role','public.whatsapp_connections','REFERENCES')),
     (has_table_privilege('service_role','public.whatsapp_connections','TRIGGER'))) s(v);"

printf '\n============ BLOCO C — rollback do proprio arquivo ============\n'
sed -n '1,5p' "$migration" | sed -n 's/^-- Rollback: //p' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'a migration nao tem a linha -- Rollback: executavel'
grep -q 'GRANT' "$tmp_dir/rollback.sql" || fail 'rollback nao contem GRANT'
psql_file "$tmp_dir/rollback.sql" >/dev/null
pass 'C.1 a linha -- Rollback: executou sem erro'

expect_value 'C.2 rollback devolveu ALL ao anon na tabela' 't' \
  "SELECT bool_and(v) FROM (VALUES
     (has_table_privilege('anon','public.whatsapp_connections','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections','INSERT')),
     (has_table_privilege('anon','public.whatsapp_connections','UPDATE')),
     (has_table_privilege('anon','public.whatsapp_connections','DELETE')),
     (has_table_privilege('anon','public.whatsapp_connections','TRUNCATE')),
     (has_table_privilege('anon','public.whatsapp_connections','REFERENCES')),
     (has_table_privilege('anon','public.whatsapp_connections','TRIGGER'))) s(v);"
expect_value 'C.3 rollback devolveu SELECT ao anon nas 3 views' 't|t|t' \
  "SELECT string_agg(CASE WHEN v THEN 't' ELSE 'f' END,'|') FROM (VALUES
     (has_table_privilege('anon','public.whatsapp_connections_safe','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections_agent','SELECT')),
     (has_table_privilege('anon','public.whatsapp_connections_public','SELECT'))) s(v);"
expect_value 'C.4 rollback devolveu TRUNCATE/TRIGGER/REFERENCES ao authenticated' 't|t|t' \
  "SELECT string_agg(CASE WHEN v THEN 't' ELSE 'f' END,'|') FROM (VALUES
     (has_table_privilege('authenticated','public.whatsapp_connections','TRUNCATE')),
     (has_table_privilege('authenticated','public.whatsapp_connections','TRIGGER')),
     (has_table_privilege('authenticated','public.whatsapp_connections','REFERENCES'))) s(v);"

psql_file "$migration" >/dev/null
expect_value 'C.5 reaplicar a migration e idempotente (anon sem SELECT de novo)' 'f' \
  "SELECT has_table_privilege('anon','public.whatsapp_connections','SELECT');"

printf '\nE44 whatsapp_connections grants (%s): %s cenarios aprovados.\n' "$postgres_image" "$passed"
