#!/usr/bin/env bash
# QA (varredura 2026-11-14) — supabase/migrations/20260927520000_add_department_rls_policies.sql:1
# criou dept_invites_select_authenticated em public.department_invites com USING(true) para
# authenticated: qualquer agente autenticado le os codigos de convite de QUALQUER departamento.
#
# A migration 20261102012200_department_invites_restringe_escrita.sql ja tinha restrito
# INSERT/DELETE desta mesma tabela a admin (decisao do dono: so admin cria e apaga convites),
# mas deixou o SELECT esquecido em USING(true) — confirmado ao vivo (db_list_policies) antes
# deste fix. A tabela esta abandonada pelo app (grep em src/ e supabase/functions/ nao acha
# nenhum `.from('department_invites')`: aceite e criacao usam as RPCs SECURITY DEFINER sobre
# department_invitations), mas a correcao restringe a policy a admin em vez de confiar nisso.
#
# Prova, em Postgres descartavel (via docker-shim: scripts/db-audit/docker-shim roteia para o
# servico local, sem subir container novo), que:
#   ANTES (policy original): um authenticated QUALQUER (nao-admin, nao-criador) LE o convite de
#     outro departamento — o furo.
#   DEPOIS (SQL real da migration 20261114120000_department_invites_restringe_select.sql):
#     o mesmo authenticated NAO VE NADA, e um authenticated admin continua vendo.
#
# Uso: bash scripts/db-audit/department-invites-select-admin-only.test.sh
#      DEPARTMENT_INVITES_SELECT_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261114120000_department_invites_restringe_select.sql"
postgres_image="${DEPARTMENT_INVITES_SELECT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-dept-invites-select-test-$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-dept-invites-select-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
# Executa como o papel "authenticated" (SET ROLE), com auth.uid() resolvendo para $1.
as_authenticated() {
  local uid="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$uid', false); $sql"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

grep -qF 'DROP POLICY IF EXISTS "dept_invites_select_authenticated" ON public.department_invites;' "$migration" ||
  fail 'o arquivo do repo perdeu o DROP da policy aberta'
grep -qF 'CREATE POLICY "dept_invites_select_admin" ON public.department_invites' "$migration" ||
  fail 'o arquivo do repo perdeu a CREATE POLICY admin-only'
grep -qF 'USING (public.is_admin(auth.uid()));' "$migration" ||
  fail 'o arquivo do repo perdeu o USING is_admin(auth.uid())'
ok 'o arquivo do repo tem o DROP + CREATE POLICY esperados (o teste so le)'

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=dept_invites_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  logs="$(docker logs "$container_name" 2>&1 || true)"
  if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] &&
    psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── esquema minimo (roles reais, auth.uid() real, is_admin() real do ledger) ────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- is_admin(uuid): identico ao de 20260830080000_fn_is_admin_and_fix_permissions_rls.sql.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::public.app_role
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);

-- department_invites: forma ao vivo (confirmada em src/integrations/supabase/types.ts).
CREATE TABLE public.department_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  department_id uuid NOT NULL REFERENCES public.departments(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.department_invites ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.department_invites TO authenticated;

-- policy ORIGINAL (20260927520000_add_department_rls_policies.sql:1) — o furo.
CREATE POLICY dept_invites_select_authenticated ON public.department_invites
  FOR SELECT TO authenticated USING (true);

-- dados: admin dono do departamento D1 cria um convite; agente comum U_OUTRO nao e admin,
-- nao criou o convite e nao pertence a D1.
INSERT INTO public.profiles (id, user_id) VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000a001'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000a002');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'admin');
INSERT INTO public.departments (id, name) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Financeiro');
INSERT INTO public.department_invites (id, code, created_by, department_id, expires_at) VALUES
  ('44444444-4444-4444-4444-444444444444', 'ABCD1234',
   '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', now() + interval '1 day');
SQL

echo
echo '── ANTES: policy original (USING true) — reproduz o furo ───────────────────────────'
psql_file "$tmp_dir/pre.sql" >/dev/null
v="$(as_authenticated '00000000-0000-0000-0000-00000000a002' 'SELECT count(*) FROM public.department_invites;' | tail -n1)"
[[ "$v" == "1" ]] || fail "ANTES nao reproduziu o furo: agente comum deveria ler 1 convite alheio, leu $v"
ok "ANTES: agente comum (nao-admin, nao-criador) LE o convite de outro departamento (furo reproduzido, count=$v)"

echo
echo '── DEPOIS: aplicando o SQL real da migration ────────────────────────────────────────'
psql_file "$migration" >/dev/null

v="$(as_authenticated '00000000-0000-0000-0000-00000000a002' 'SELECT count(*) FROM public.department_invites;' | tail -n1)"
[[ "$v" == "0" ]] || fail "DEPOIS: agente comum ainda le convite alheio (count=$v, esperado 0)"
ok 'DEPOIS: agente comum (nao-admin) NAO VE MAIS nenhum convite'

v="$(as_authenticated '00000000-0000-0000-0000-00000000a001' 'SELECT count(*) FROM public.department_invites;' | tail -n1)"
[[ "$v" == "1" ]] || fail "DEPOIS: admin deveria continuar lendo o convite (count=$v, esperado 1)"
ok 'DEPOIS: admin continua lendo os convites normalmente'

echo
printf '[OK] contrato dept_invites_select_admin verificado: %s asseracoes (%s)\n' \
  "$passed" "$postgres_image"
