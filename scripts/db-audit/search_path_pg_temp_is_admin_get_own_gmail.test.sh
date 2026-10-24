#!/usr/bin/env bash
# n-148 (P3 · SEC-RLS_TAREFAS_EMAIL_LIGACOES-07) — search_path com pg_temp nas duas funcoes
# SECURITY DEFINER que o audit adversarial encontrou com `SET search_path = public`:
# public.is_admin_or_supervisor(uuid) e public.get_own_gmail_accounts().
#
# O estado ANTERIOR vem dos ARQUIVOS REAIS do repo, aplicados nesta ordem:
#   supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql (cria is_admin_or_supervisor)
#   supabase/migrations/20260828210000_get_own_gmail_accounts_filter_active.sql (cria get_own_gmail_accounts)
# O pre.sql deste teste contem SO stubs dos pre-requisitos que esses arquivos exigem
# (papeis anon/authenticated/service_role, auth.uid()/auth.role(), auth.users, storage.*,
# contacts/profiles/whatsapp_connections, publication supabase_realtime, tabela gmail_accounts)
# e NAO reescreve corpo, assinatura nem ACL das funcoes.
#
# DISCRIMINADOR vermelho->verde: SO proconfig (A1/A2 x B1/B2). Os corpos das duas funcoes
# qualificam public.* (public.user_roles, public.gmail_accounts), por isso temp tables
# hostis NAO shadowam o resultado nem sem a correcao: A6/B6 passam antes e depois e sao
# guardas de regressao, nao prova do defeito.
#
# Roda o MESMO roteiro num PostgreSQL 17 DESCARTAVEL e aplica o ARQUIVO de migration REAL:
#   BLOCO A — estado ANTERIOR (arquivos reais, search_path = public, sem pg_temp):
#             registra o defeito (proconfig sem pg_temp, A1/A2) e prova o contrato
#             funcional das duas funcoes rodando como o papel authenticated com
#             request.jwt.claims. A0a/A0b mostram o ACL ainda ABERTO (default PUBLIC).
#   BLOCO B — migration aplicada: search_path passa a `public, pg_temp`; o contrato
#             funcional nao muda, o ACL fecha (B7-B10, fechado PELA migration, que e a
#             unica a tocar em REVOKE/GRANT neste teste) e as temp tables HOSTIS seguem
#             sem shadowar (B6, guarda de regressao).
#
# Sem dependencia de banco/stack do cartao: sobe container proprio (roles anon/
# authenticated/service_role sao globais ao cluster — por isso SKIP_DOCKER_SHIM=1).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010150628_search_path_pg_temp_is_admin_get_own_gmail.sql"
origin_is_admin="$repo_root/supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
origin_gmail="$repo_root/supabase/migrations/20260828210000_get_own_gmail_accounts_filter_active.sql"
postgres_image="${SEARCH_PATH_PG_TEMP_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-search-path-pg-temp-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-search-path-pg-temp-test-[0-9]+$ ]]; then
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
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$origin_is_admin" ]] || fail "origem real nao encontrada: $origin_is_admin"
[[ -f "$origin_gmail" ]] || fail "origem real nao encontrada: $origin_gmail"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# Stubs MINIMOS dos pre-requisitos que as migrations reais exigem. Nada de corpo,
# assinatura ou ACL de funcao aqui: as funcoes vem dos arquivos reais abaixo.
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

-- auth.users: a origem 20251215025014 referencia auth.users(id) em FKs e num trigger.
CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- storage: a origem 20251215025014 insere em storage.buckets e cria policies em storage.objects.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text);

-- Tabelas referenciadas por FKs da origem 20251215025014 (tabela calls).
CREATE TABLE public.contacts (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY);

-- A origem 20251215025014 termina com ALTER PUBLICATION supabase_realtime ADD TABLE.
CREATE PUBLICATION supabase_realtime;

-- gmail_accounts: stub fiel (so as colunas que get_own_gmail_accounts le).
-- A FUNCAO vem do arquivo real 20260828210000, aplicado abaixo.
CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sync_status text,
  last_sync_at timestamptz,
  last_error text,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
-- auth.users primeiro: user_roles e audit_logs têm FK para auth.users(id).
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

INSERT INTO public.user_roles (user_id, role)
  VALUES ('11111111-1111-1111-1111-111111111111', 'admin');

INSERT INTO public.gmail_accounts (id, user_id, email_address, is_active) VALUES
  ('a1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'agente-ativo@exemplo.test', true),
  ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agente-desconectado@exemplo.test', false),
  ('a1000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'de-terceiro@exemplo.test', true);
SQL

# Estado ANTERIOR a partir dos ARQUIVOS REAIS (nao ha CREATE FUNCTION manual neste teste).
psql_file "$tmp_dir/pre.sql"
psql_file "$origin_is_admin"
psql_file "$origin_gmail"
psql_file "$tmp_dir/seed.sql"

ADMIN='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
AGENT='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
ANON='{"sub":"00000000-0000-0000-0000-000000000000","role":"anon"}'

# Roda como authenticated (papel real) com request.jwt.claims, tudo na MESMA sessao.
as_agent() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT" "$1"; }
as_admin() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN" "$1"; }

# Temp tables HOSTIS com os MESMOS NOMES que as funcoes resolvem, tentando escalar/ver
# conta de terceiro. Criadas pelo proprio chamador (authenticated) na mesma sessao.
# NOTA: passam antes E depois (corpos qualificam public.*); sao guarda de regressao.
HOSTIL="CREATE TEMP TABLE user_roles (user_id uuid, role text); \
  INSERT INTO user_roles VALUES ('22222222-2222-2222-2222-222222222222', 'admin'); \
  CREATE TEMP TABLE gmail_accounts (id uuid, user_id uuid, email_address text, is_active boolean); \
  INSERT INTO gmail_accounts VALUES ('deadbeef-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'invasor@exemplo.test', true); \
  SELECT public.is_admin_or_supervisor('22222222-2222-2222-2222-222222222222'::uuid)::text \
       || ',' || (SELECT count(*) FROM public.get_own_gmail_accounts())::text;"

echo '── BLOCO A: estado ANTERIOR (arquivos reais, search_path = public, sem pg_temp) ───'

# ACL ainda ABERTO no estado anterior (EXECUTE default para PUBLIC): nenhum REVOKE foi
# aplicado ate aqui, entao B7/B8 (fechado) provam que e a migration quem fecha.
expect_value 'A0a anon AINDA executa is_admin_or_supervisor antes da migration (ACL aberto)' 't' \
  "SELECT has_function_privilege('anon', 'public.is_admin_or_supervisor(uuid)', 'EXECUTE');"
expect_value 'A0b anon AINDA executa get_own_gmail_accounts antes da migration (ACL aberto)' 't' \
  "SELECT has_function_privilege('anon', 'public.get_own_gmail_accounts()', 'EXECUTE');"

expect_value 'A1 is_admin_or_supervisor esta SEM pg_temp (defeito)' '{search_path=public}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='is_admin_or_supervisor';"
expect_value 'A2 get_own_gmail_accounts esta SEM pg_temp (defeito)' '{search_path=public}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='get_own_gmail_accounts';"

expect_value 'A3 (authenticated) agente comum NAO e admin/supervisor' 'f' \
  "$(as_agent "SELECT public.is_admin_or_supervisor('22222222-2222-2222-2222-222222222222'::uuid);")"
expect_value 'A4 (authenticated) admin e reconhecido' 't' \
  "$(as_admin "SELECT public.is_admin_or_supervisor('11111111-1111-1111-1111-111111111111'::uuid);")"
expect_value 'A5 (authenticated) agente ve SÓ a conta ativa dele (1), nao a de terceiro' '1' \
  "$(as_agent "SELECT count(*) FROM public.get_own_gmail_accounts();")"

expect_value 'A6 (guarda de regressao) temp tables hostis NAO escalam nem revelam terceiro' 'false,1' \
  "$(as_agent "$HOSTIL")"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS da migration (search_path = public, pg_temp) ───────────────────'

expect_value 'B1 is_admin_or_supervisor agora tem pg_temp' '{"search_path=public, pg_temp"}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='is_admin_or_supervisor';"
expect_value 'B2 get_own_gmail_accounts agora tem pg_temp' '{"search_path=public, pg_temp"}' \
  "SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='get_own_gmail_accounts';"

expect_value 'B3 (authenticated) agente comum continua NAO admin (contrato preservado)' 'f' \
  "$(as_agent "SELECT public.is_admin_or_supervisor('22222222-2222-2222-2222-222222222222'::uuid);")"
expect_value 'B4 (authenticated) admin continua reconhecido (contrato preservado)' 't' \
  "$(as_admin "SELECT public.is_admin_or_supervisor('11111111-1111-1111-1111-111111111111'::uuid);")"
expect_value 'B5 (authenticated) agente continua vendo SÓ a conta ativa dele (1)' '1' \
  "$(as_agent "SELECT count(*) FROM public.get_own_gmail_accounts();")"

expect_value 'B6 (guarda de regressao) temp tables hostis NAO shadowam o resultado' 'false,1' \
  "$(as_agent "$HOSTIL")"

expect_value 'B7 anon NAO executa is_admin_or_supervisor (ACL fechado pela migration)' 'f' \
  "SELECT has_function_privilege('anon', 'public.is_admin_or_supervisor(uuid)', 'EXECUTE');"
expect_value 'B8 anon NAO executa get_own_gmail_accounts (ACL fechado pela migration)' 'f' \
  "SELECT has_function_privilege('anon', 'public.get_own_gmail_accounts()', 'EXECUTE');"
expect_value 'B9 authenticated executa is_admin_or_supervisor (ACL preservado)' 't' \
  "SELECT has_function_privilege('authenticated', 'public.is_admin_or_supervisor(uuid)', 'EXECUTE');"
expect_value 'B10 authenticated executa get_own_gmail_accounts (ACL preservado)' 't' \
  "SELECT has_function_privilege('authenticated', 'public.get_own_gmail_accounts()', 'EXECUTE');"

printf '\n[OK] search_path com pg_temp em is_admin_or_supervisor e get_own_gmail_accounts (n-148) verificado\n'
