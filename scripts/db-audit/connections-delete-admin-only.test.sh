#!/usr/bin/env bash
# Contrato de autorizacao da EXCLUSAO de conexao (DELETE em whatsapp_connections).
#
# Causa raiz: a policy de DELETE exigia apenas is_admin_or_supervisor, entao o
# SUPERVISOR apagava a conexao pela tabela — e a Edge evolution-api, chamada com
# service_role (que ignora RLS), apagava a instancia na Evolution em nome dele.
#
# BLOCO A (antes): supervisor DELETE derruba a conexao (o defeito).
# BLOCO B (depois): supervisor DELETE nao apaga nada; admin DELETE apaga; agente
#   sem papel nao apaga; e INSERT/UPDATE do supervisor seguem valendo (a migration
#   troca SO a policy de DELETE).
#
# A migration e aplicada a partir do proprio arquivo versionado, sobre um
# PostgreSQL descartavel, com as roles reais (authenticated/anon/service_role) e
# auth.uid() lendo o claim 'sub'.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261012113232_connections_delete_admin_only.sql"
pre_state="$repo_root/supabase/migrations/20260319134839_76acd83b-182d-46f0-a127-4a9bdbd0ddee.sql"
postgres_image="${CONN_DELETE_ADMIN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-conn-delete-admin-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-conn-delete-admin-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$pre_state" ]] || fail "migration de estado anterior nao encontrada: $pre_state"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Ambiente: roles reais, auth.uid(), predicados e a tabela com as policies de HEAD ──
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

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- Predicados: MESMO corpo das migrations reais (20251215025014 e 20260830080000).
CREATE FUNCTION public.is_admin_or_supervisor(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
CREATE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::public.app_role
  )
$$;

CREATE TABLE public.whatsapp_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  instance_id TEXT,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_pending')),
  qr_code TEXT,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO service_role;
GRANT SELECT ON public.whatsapp_connections TO anon;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.whatsapp_connections;
INSERT INTO public.whatsapp_connections (id, name, phone_number, instance_id, status, is_default) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'CONN_A', '5511900000001', 'inst-a', 'connected', false),
  ('c0000000-0000-0000-0000-000000000002', 'CONN_B', '5511900000002', 'inst-b', 'connected', false),
  ('c0000000-0000-0000-0000-000000000003', 'CONN_C', '5511900000003', 'inst-c', 'connected', false);
DELETE FROM public.user_roles;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'supervisor'),
  ('33333333-3333-3333-3333-333333333333', 'agent');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$pre_state"     # estado de HEAD para as policies (authz entregue em 20260319)
psql_file "$tmp_dir/seed.sql"

ADMIN_CLAIMS='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
SUPERVISOR_CLAIMS='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
AGENT_CLAIMS='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'

admin()      { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN_CLAIMS" "$1"; }
supervisor() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$SUPERVISOR_CLAIMS" "$1"; }
agent()      { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT_CLAIMS" "$1"; }

CONN_A='c0000000-0000-0000-0000-000000000001'
CONN_B='c0000000-0000-0000-0000-000000000002'
CONN_C='c0000000-0000-0000-0000-000000000003'

echo '── BLOCO A: ANTES da migration (o defeito) ─────────────────────────────────────'

expect_ok 'A1 supervisor exclui conexao pela tabela (defeito)' \
  "$(supervisor "DELETE FROM public.whatsapp_connections WHERE id='$CONN_A';")"
expect_value 'A1 conexao CONN_A foi apagada pelo supervisor' '0' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE id='$CONN_A'"

psql_file "$tmp_dir/seed.sql"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: DEPOIS da migration ────────────────────────────────────────────────'

expect_ok 'B1 supervisor executa DELETE sem erro (RLS filtra a linha)' \
  "$(supervisor "DELETE FROM public.whatsapp_connections WHERE id='$CONN_A';")"
expect_value 'B1 conexao CONN_A INTACTA (supervisor nao apaga)' '1' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE id='$CONN_A'"

expect_ok 'B2 agente (sem papel) executa DELETE sem erro (RLS filtra a linha)' \
  "$(agent "DELETE FROM public.whatsapp_connections WHERE id='$CONN_C';")"
expect_value 'B2 conexao CONN_C INTACTA (agente nao apaga)' '1' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE id='$CONN_C'"

expect_ok 'B3 admin exclui conexao (caso legitimo preservado)' \
  "$(admin "DELETE FROM public.whatsapp_connections WHERE id='$CONN_B';")"
expect_value 'B3 conexao CONN_B apagada pelo admin' '0' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE id='$CONN_B'"

# Nao quebrar o existente: SO a policy de DELETE mudou. Supervisor segue inserindo/alterando.
expect_ok 'B4 supervisor segue podendo INSERIR conexao' \
  "$(supervisor "INSERT INTO public.whatsapp_connections (name, phone_number, instance_id, status) VALUES ('CONN_D','5511900000004','inst-d','disconnected');")"
expect_value 'B4 conexao nova gravada pelo supervisor' '1' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE instance_id='inst-d'"

expect_ok 'B5 supervisor segue podendo ALTERAR conexao' \
  "$(supervisor "UPDATE public.whatsapp_connections SET name='CONN_A2' WHERE id='$CONN_A';")"
expect_value 'B5 alteracao do supervisor gravada' 'CONN_A2' \
  "SELECT name FROM public.whatsapp_connections WHERE id='$CONN_A'"

# service_role (fora da RLS): a Edge com service_role continua podendo apagar a linha.
expect_ok 'B6 service_role segue podendo excluir (Edge/cron, BYPASSRLS)' \
  "SET ROLE service_role; DELETE FROM public.whatsapp_connections WHERE id='$CONN_C';"
expect_value 'B6 CONN_C apagada por service_role' '0' \
  "SELECT count(*) FROM public.whatsapp_connections WHERE id='$CONN_C'"

expect_value 'Z1 ao final, a unica policy de DELETE e a nova; nenhuma outra abre o DELETE' '1' \
  "SELECT count(DISTINCT polname) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relname='whatsapp_connections' AND p.polcmd='d'"

printf '\n[OK] contrato de exclusao de conexao (admin-only) verificado\n'
