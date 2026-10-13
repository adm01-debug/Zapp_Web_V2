#!/usr/bin/env bash
# NET-POLICY-ADMIN-ONLY: as policies de escrita de public.ip_whitelist e
# public.geo_blocking_settings eram FOR ALL com public.is_admin_or_supervisor(),
# ou seja, um SUPERVISOR podia inserir/alterar/apagar a whitelist de IP e o
# bloqueio geografico do sistema. Escrita nessas duas tabelas passa a exigir
# public.is_admin(); a leitura continua com as policies SELECT existentes,
# ambas com is_admin_or_supervisor(), de modo que supervisor continua VENDO.
#
# Roda em Postgres descartavel, com os papeis reais (anon/authenticated/
# service_role) e as definicoes reais de auth.uid(), user_roles, is_admin(),
# is_admin_or_supervisor() e das duas tabelas (colunas e grants MEDIDOS no banco
# local da tarefa em 2026-10-13):
#   BLOCO A — defeito: supervisor escreve nas duas tabelas (policy FOR ALL).
#   BLOCO B — migration real aplicada (psql -f do arquivo): supervisor deixa de
#             escrever, admin escreve, supervisor e admin seguem lendo, anon nao
#             le nem escreve, service_role nao muda; inventario de policies sem
#             nenhuma FOR ALL restante.
#   BLOCO C — a linha "-- Rollback" do proprio arquivo e executada e devolve o
#             estado anterior (supervisor volta a escrever); reaplicar a
#             migration volta a negar.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261013035213_network_policy_tables_admin_only.sql"
postgres_image="${NETPOL_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-netpol-test-$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-netpol-test-[0-9]+$ ]]; then
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
expect_value_role() {
  local l="$1" e="$2" r="$3" j="$4" s="$5" a
  a="$(as_role "$r" "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_ok_role() {
  local l="$1" r="$2" j="$3" s="$4"
  as_role "$r" "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como $r)"
  pass "$l"
}
expect_error_role() {
  local l="$1" needle="$2" r="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$r" "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
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

-- has_role / is_admin / is_admin_or_supervisor nas definicoes REAIS.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::public.app_role
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
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- Colunas REAIS medidas no banco local da tarefa (2026-10-13).
CREATE TABLE public.ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  description text NOT NULL,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.geo_blocking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'disabled',
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants REAIS da tarefa: os tres papeis com ALL (arwdDxtm) nas duas tabelas.
GRANT ALL ON public.ip_whitelist, public.geo_blocking_settings TO anon, authenticated, service_role;

-- Estado ANTERIOR (o defeito): escrita FOR ALL com is_admin_or_supervisor.
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Admins can view IP whitelist" ON public.ip_whitelist
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

ALTER TABLE public.geo_blocking_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage geo settings" ON public.geo_blocking_settings
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Geo blocking visible to admins only" ON public.geo_blocking_settings
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.ip_whitelist;
DELETE FROM public.geo_blocking_settings;
DELETE FROM public.user_roles;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaa1111-1111-1111-1111-111111111111', 'admin'::public.app_role),
  ('bbbb2222-2222-2222-2222-222222222222', 'supervisor'::public.app_role),
  ('cccc3333-3333-3333-3333-333333333333', 'agent'::public.app_role);
INSERT INTO public.ip_whitelist (id, ip_address, description, added_by)
VALUES ('10a00000-0000-0000-0000-000000000001', '10.0.0.1', 'origem', 'aaaa1111-1111-1111-1111-111111111111');
INSERT INTO public.geo_blocking_settings (id, mode, updated_by)
VALUES ('10b00000-0000-0000-0000-000000000001', 'disabled', 'aaaa1111-1111-1111-1111-111111111111');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ADM='{"sub":"aaaa1111-1111-1111-1111-111111111111","role":"authenticated"}'
SUP='{"sub":"bbbb2222-2222-2222-2222-222222222222","role":"authenticated"}'
AGT='{"sub":"cccc3333-3333-3333-3333-333333333333","role":"authenticated"}'
ANON='{"role":"anon"}'
SVC='{"role":"service_role"}'

ins_ip="INSERT INTO public.ip_whitelist (ip_address, description, added_by) VALUES ('10.9.9.9','nova','aaaa1111-1111-1111-1111-111111111111');"
ins_geo="INSERT INTO public.geo_blocking_settings (mode, updated_by) VALUES ('enabled','aaaa1111-1111-1111-1111-111111111111');"
upd_ip="WITH u AS (UPDATE public.ip_whitelist SET description='hack' WHERE ip_address='10.0.0.1' RETURNING 1) SELECT count(*) FROM u;"
del_ip="WITH d AS (DELETE FROM public.ip_whitelist WHERE ip_address='10.0.0.1' RETURNING 1) SELECT count(*) FROM d;"
upd_geo="WITH u AS (UPDATE public.geo_blocking_settings SET mode='blocked' WHERE id='10b00000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) FROM u;"

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_ok_role 'A.1 (DEFEITO) supervisor INSERE em ip_whitelist (policy FOR ALL)' \
  'authenticated' "$SUP" "$ins_ip"
expect_value 'A.2 (DEFEITO) a linha do supervisor entrou em ip_whitelist' '2' \
  "SELECT count(*) FROM public.ip_whitelist;"
expect_value_role 'A.3 (DEFEITO) supervisor APAGA linha em ip_whitelist' '1' \
  'authenticated' "$SUP" "$del_ip"
expect_value_role 'A.4 (DEFEITO) supervisor ALTERA linha em geo_blocking_settings' '1' \
  'authenticated' "$SUP" "$upd_geo"
expect_value_role 'A.5 supervisor LE ip_whitelist (comportamento que deve ser mantido)' '1' \
  'authenticated' "$SUP" "SELECT count(*) FROM public.ip_whitelist;"
psql_file "$tmp_dir/seed.sql" >/dev/null

printf '\n============ BLOCO B — migration real aplicada ============\n'
psql_file "$migration" >/dev/null

expect_error_role 'B.1 supervisor NAO insere em ip_whitelist (RLS)' \
  'row-level security' 'authenticated' "$SUP" "$ins_ip"
expect_value_role 'B.2 supervisor NAO altera ip_whitelist (0 linhas)' '0' \
  'authenticated' "$SUP" "$upd_ip"
expect_value_role 'B.3 supervisor NAO apaga ip_whitelist (0 linhas)' '0' \
  'authenticated' "$SUP" "$del_ip"
expect_error_role 'B.4 supervisor NAO insere em geo_blocking_settings (RLS)' \
  'row-level security' 'authenticated' "$SUP" "$ins_geo"
expect_value_role 'B.5 supervisor NAO altera geo_blocking_settings (0 linhas)' '0' \
  'authenticated' "$SUP" "$upd_geo"

expect_ok_role 'B.6 admin INSERE em ip_whitelist' 'authenticated' "$ADM" "$ins_ip"
expect_value_role 'B.7 admin ALTERA ip_whitelist' '1' 'authenticated' "$ADM" \
  "WITH u AS (UPDATE public.ip_whitelist SET description='ok' WHERE ip_address='10.9.9.9' RETURNING 1) SELECT count(*) FROM u;"
expect_value_role 'B.8 admin APAGA ip_whitelist' '1' 'authenticated' "$ADM" \
  "WITH d AS (DELETE FROM public.ip_whitelist WHERE ip_address='10.9.9.9' RETURNING 1) SELECT count(*) FROM d;"
expect_ok_role 'B.9 admin INSERE em geo_blocking_settings' 'authenticated' "$ADM" "$ins_geo"
expect_value_role 'B.10 admin ALTERA geo_blocking_settings' '1' 'authenticated' "$ADM" "$upd_geo"
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_value_role 'B.11 supervisor LE ip_whitelist (leitura preservada)' '1' \
  'authenticated' "$SUP" "SELECT count(*) FROM public.ip_whitelist;"
expect_value_role 'B.12 supervisor LE geo_blocking_settings (leitura preservada)' '1' \
  'authenticated' "$SUP" "SELECT count(*) FROM public.geo_blocking_settings;"
expect_value_role 'B.13 admin LE ip_whitelist' '1' \
  'authenticated' "$ADM" "SELECT count(*) FROM public.ip_whitelist;"
expect_value_role 'B.14 agente comum NAO le ip_whitelist (RLS filtra)' '0' \
  'authenticated' "$AGT" "SELECT count(*) FROM public.ip_whitelist;"

expect_value_role 'B.15 anon NAO le ip_whitelist (RLS filtra)' '0' \
  'anon' "$ANON" "SELECT count(*) FROM public.ip_whitelist;"
expect_error_role 'B.16 anon NAO insere em ip_whitelist (RLS)' \
  'row-level security' 'anon' "$ANON" "$ins_ip"
expect_error_role 'B.17 anon NAO insere em geo_blocking_settings (RLS)' \
  'row-level security' 'anon' "$ANON" "$ins_geo"

expect_ok_role 'B.18 service_role insere em ip_whitelist (BYPASSRLS intacto)' \
  'service_role' "$SVC" "$ins_ip"
expect_ok_role 'B.19 service_role insere em geo_blocking_settings (BYPASSRLS intacto)' \
  'service_role' "$SVC" "$ins_geo"
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_value 'B.20 nenhuma policy FOR ALL restou nas duas tabelas' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public'
     AND tablename IN ('ip_whitelist','geo_blocking_settings') AND cmd='ALL';"
expect_value 'B.21 inventario de ip_whitelist (3 escrita + 1 leitura)' \
  'Admins can delete IP whitelist|DELETE|authenticated; Admins can insert IP whitelist|INSERT|authenticated; Admins can update IP whitelist|UPDATE|authenticated; Admins can view IP whitelist|SELECT|authenticated' \
  "SELECT string_agg(policyname||'|'||cmd||'|'||array_to_string(roles,','),'; ' ORDER BY policyname)
     FROM pg_policies WHERE schemaname='public' AND tablename='ip_whitelist';"
expect_value 'B.22 inventario de geo_blocking_settings (3 escrita + 1 leitura)' \
  'Admins can delete geo settings|DELETE|authenticated; Admins can insert geo settings|INSERT|authenticated; Admins can update geo settings|UPDATE|authenticated; Geo blocking visible to admins only|SELECT|authenticated' \
  "SELECT string_agg(policyname||'|'||cmd||'|'||array_to_string(roles,','),'; ' ORDER BY policyname)
     FROM pg_policies WHERE schemaname='public' AND tablename='geo_blocking_settings';"

printf '\n============ BLOCO C — rollback do proprio arquivo ============\n'
sed -n 's/^--   //p' "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'a migration nao tem bloco "-- Rollback (SQL executavel...)"'
grep -q 'CREATE POLICY' "$tmp_dir/rollback.sql" || fail 'rollback nao recria as policies FOR ALL'
psql_file "$tmp_dir/rollback.sql" >/dev/null
pass 'C.1 o bloco de rollback executou sem erro'

expect_ok_role 'C.2 rollback devolveu ao supervisor a escrita em ip_whitelist' \
  'authenticated' "$SUP" "$ins_ip"
expect_value_role 'C.3 rollback devolveu ao supervisor a escrita em geo_blocking_settings' '1' \
  'authenticated' "$SUP" "$upd_geo"
psql_file "$tmp_dir/seed.sql" >/dev/null

psql_file "$migration" >/dev/null
expect_error_role 'C.4 reaplicar a migration volta a negar o supervisor (idempotente)' \
  'row-level security' 'authenticated' "$SUP" "$ins_ip"

printf '\nNET-POLICY-ADMIN-ONLY ip_whitelist/geo_blocking_settings (%s): %s cenarios aprovados.\n' \
  "$postgres_image" "$passed"
