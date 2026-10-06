#!/usr/bin/env bash
# R2-AUTH-015 (P2) — "Convite de agente nao cria convite autenticavel nem provisiona papel escolhido".
#
# Prova, em PostgreSQL descartavel, o comportamento da migration real
# supabase/migrations/20261006133323_agent_invitations_flow.sql:
#
#   BLOCO A (vermelho) — antes da migration nao existe convite nenhum: a tabela
#             public.agent_invitations e as RPCs create_agent_invite/accept_agent_invite/
#             list_agent_invites nao existem (era so e-mail com o texto do papel).
#   BLOCO B (verde)    — com a migration aplicada:
#             * so admin/supervisor cria convite; papel 'admin' sai apenas de um admin;
#             * convite tem destinatario normalizado, papel, validade e consumo unico;
#             * e-mail existente e novo sao distinguidos (existing_account);
#             * um segundo convite PENDENTE para o mesmo e-mail e recusado;
#             * quem aceita recebe o papel DO CONVITE, decidido no servidor, a partir de
#               auth.uid() + auth.users.email — nunca de metadata do convidado;
#             * convite expirado, e-mail de outro convidado e uso repetido nao atribuem papel;
#             * ACL: anon sem EXECUTE, authenticated sem leitura direta da tabela;
#             * list_agent_invites mostra estado derivado para admin/supervisor e vazio para o resto.
#   BLOCO C            — o Rollback do cabecalho desfaz a migration (funcoes e tabela somem,
#             sem levar junto dados de user_roles).
#
# Papel de usuario de verdade (SET ROLE authenticated/anon + request.jwt.claims), nunca superusuario
# nas assercoes; o pre-estado do Supabase (papeis, default privileges, schema auth) e recriado a mao.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006133323_agent_invitations_flow.sql"
postgres_image="${AGENT_INVITATIONS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-agent-invitations-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-agent-invitations-test-[0-9]+$ ]]; then
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
as_role() {  # as_role <papeis> <jwt|-> <sql>
  local role="$1" jwt="$2" sql="$3"
  if [ "$jwt" = "-" ]; then
    docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
      -c "SET ROLE $role; $sql"
  else
    docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
      -c "SET ROLE $role; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
  fi
}
as_user() { as_role authenticated "$1" "$2"; }
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
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

expect_error_as_role() {
  local l="$1" needle="$2" role="$3" j="$4" s="$5" out st
  set +e; out="$(as_role "$role" "$j" "$s" 2>&1)"; st=$?; set -e
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

ADMIN_UUID='11111111-1111-1111-1111-111111111111'
SUP_UUID='22222222-2222-2222-2222-222222222222'
AGENT_UUID='33333333-3333-3333-3333-333333333333'
OTHER_UUID='44444444-4444-4444-4444-444444444444'

cat > "$tmp_dir/pre.sql" <<'SQL'
-- Superficie minima do Supabase, na forma ANTERIOR a migration.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text,
  email text,
  role text DEFAULT 'agent'
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Privilégios como no Supabase: o schema e as tabelas novas recebem grants amplos dos papeis.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Fixture: um admin, um supervisor, um agente e um quarto usuario sem papel privilegiado.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@empresa.com'),
  ('22222222-2222-2222-2222-222222222222', 'sup@empresa.com'),
  ('33333333-3333-3333-3333-333333333333', 'agente@empresa.com'),
  ('44444444-4444-4444-4444-444444444444', 'outro@empresa.com');

INSERT INTO public.profiles (id, user_id, name, email, role) VALUES
  ('91111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Admin', 'admin@empresa.com', 'admin'),
  ('92222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Sup', 'sup@empresa.com', 'supervisor'),
  ('93333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'Agente', 'agente@empresa.com', 'agent'),
  ('94444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'Outro', 'outro@empresa.com', 'agent');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'supervisor'),
  ('33333333-3333-3333-3333-333333333333', 'agent');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

ADMIN='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"admin@empresa.com"}'
SUP='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"sup@empresa.com"}'
AGENT='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","email":"agente@empresa.com"}'
OTHER='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","email":"outro@empresa.com"}'
LYING='{"sub":"33333333-3333-3333-3333-333333333333","role":"admin","agent_role":"admin","email":"agente@empresa.com","user_metadata":{"role":"admin"}}'

printf '\n== BLOCO A — o defeito antes da migration (so havia e-mail, nenhum convite) ==\n'
expect_value 'tabela agent_invitations nao existe antes da migration' 't' \
  "SELECT to_regclass('public.agent_invitations') IS NULL"
expect_value 'create_agent_invite nao existe antes da migration' 'f' \
  "SELECT to_regprocedure('public.create_agent_invite(text,text,text,integer)') IS NOT NULL"
expect_value 'accept_agent_invite nao existe antes da migration' 'f' \
  "SELECT to_regprocedure('public.accept_agent_invite(text)') IS NOT NULL"
expect_value 'list_agent_invites nao existe antes da migration' 'f' \
  "SELECT to_regprocedure('public.list_agent_invites(integer)') IS NOT NULL"

printf '\n== BLOCO B — migration aplicada: convite verificavel e papel atribuido no servidor ==\n'
psql_file "$migration" >/dev/null

# --- ACL ---
expect_value 'anon sem EXECUTE em create_agent_invite' 'f' \
  "SELECT has_function_privilege('anon', 'public.create_agent_invite(text,text,text,integer)', 'EXECUTE')"
expect_value 'authenticated com EXECUTE em create_agent_invite' 't' \
  "SELECT has_function_privilege('authenticated', 'public.create_agent_invite(text,text,text,integer)', 'EXECUTE')"
expect_value 'anon sem EXECUTE em accept_agent_invite' 'f' \
  "SELECT has_function_privilege('anon', 'public.accept_agent_invite(text)', 'EXECUTE')"
expect_value 'authenticated sem leitura direta da tabela de convites' 'f' \
  "SELECT has_table_privilege('authenticated', 'public.agent_invitations', 'SELECT')"
expect_value 'anon sem leitura direta da tabela de convites' 'f' \
  "SELECT has_table_privilege('anon', 'public.agent_invitations', 'SELECT')"

# --- quem pode convidar (papel autorizado) ---
expect_value_as 'admin cria convite para atendente' 'true' "$ADMIN" \
  "SELECT public.create_agent_invite('nova@empresa.com', 'Nova', 'agent') ->> 'ok'"
expect_value 'codigo do convite tem 12 caracteres' '12' \
  "SELECT length(code) FROM public.agent_invitations WHERE email = 'nova@empresa.com'"
expect_value 'validade do convite e futura' 't' \
  "SELECT expires_at > now() FROM public.agent_invitations WHERE email = 'nova@empresa.com'"
expect_value_as 'admin cria convite para supervisor' 'true' "$ADMIN" \
  "SELECT public.create_agent_invite('sup2@empresa.com', 'Sup2', 'supervisor') ->> 'ok'"
expect_value_as 'admin cria convite para administrador' 'true' "$ADMIN" \
  "SELECT public.create_agent_invite('admin2@empresa.com', 'Admin2', 'admin') ->> 'ok'"
expect_value_as 'supervisor cria convite para atendente' 'true' "$SUP" \
  "SELECT public.create_agent_invite('sup3@empresa.com', 'Sup3', 'agent') ->> 'ok'"
expect_value_as 'supervisor NAO convida administrador' 'not_authorized' "$SUP" \
  "SELECT public.create_agent_invite('admin3@empresa.com', 'Admin3', 'admin') ->> 'error'"
expect_value_as 'atendente comum nao convida' 'not_authorized' "$AGENT" \
  "SELECT public.create_agent_invite('x@empresa.com', 'X', 'agent') ->> 'error'"
expect_value_as 'papel invalido e recusado' 'invalid_role' "$ADMIN" \
  "SELECT public.create_agent_invite('y@empresa.com', 'Y', 'root') ->> 'error'"
expect_value_as 'e-mail invalido e recusado' 'invalid_email' "$ADMIN" \
  "SELECT public.create_agent_invite('sem-arroba', 'Z', 'agent') ->> 'error'"
expect_value_as 'e-mail e destinatario: normalizado no convite' 'plus@empresa.com' "$ADMIN" \
  "SELECT public.create_agent_invite('  Plus@Empresa.com ', 'Plus', 'agent') ->> 'email'"
expect_error_as_role 'anon nao executa a RPC de convite' 'permission denied' anon - \
  "SELECT public.create_agent_invite('anon@empresa.com', 'Anon', 'agent')"

# --- e-mail existente x novo, e convite pendente duplicado ---
expect_value_as 'e-mail que ja tem conta e sinalizado' 'true' "$ADMIN" \
  "SELECT public.create_agent_invite('agente@empresa.com', 'Agente', 'agent') ->> 'existing_account'"
expect_value_as 'e-mail novo nao e conta existente' 'false' "$ADMIN" \
  "SELECT public.create_agent_invite('virgem@empresa.com', 'Virgem', 'agent') ->> 'existing_account'"
expect_value_as 'segundo convite PENDENTE para o mesmo e-mail e recusado' 'already_pending' "$ADMIN" \
  "SELECT public.create_agent_invite('virgem@empresa.com', 'Virgem', 'agent') ->> 'error'"

# --- aceitacao: papel vem do convite, decidido no servidor ---
CODE_AGENT="$(psql_sql "SELECT code FROM public.agent_invitations WHERE email = 'agente@empresa.com' AND status = 'pending'")"
expect_value_as 'convidado aceita o convite pelo codigo' 'true' "$AGENT" \
  "SELECT public.accept_agent_invite('$CODE_AGENT') ->> 'ok'"
expect_value 'aceite provisiona o papel do convite em user_roles' '1' \
  "SELECT count(*) FROM public.user_roles WHERE user_id = '$AGENT_UUID' AND role = 'agent'"
expect_value 'aceite consome o convite (uso unico)' 'used|1|true' \
  "SELECT status || '|' || use_count || '|' || (used_at IS NOT NULL)::text FROM public.agent_invitations WHERE code = '$CODE_AGENT'"
expect_value 'aceite fica registrado na auditoria' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action = 'agent_invite_accepted' AND entity_id = (SELECT id FROM public.agent_invitations WHERE code = '$CODE_AGENT')"
expect_value_as 'uso repetido do mesmo codigo nao passa' 'invalid_or_expired_code' "$AGENT" \
  "SELECT public.accept_agent_invite('$CODE_AGENT') ->> 'error'"
expect_value 'uso repetido nao duplica o papel' '1' \
  "SELECT count(*) FROM public.user_roles WHERE user_id = '$AGENT_UUID' AND role = 'agent'"

# convite de outro destinatario
CODE_SUP2="$(psql_sql "SELECT code FROM public.agent_invitations WHERE email = 'sup2@empresa.com' AND status = 'pending'")"
expect_value_as 'convidado de OUTRO e-mail nao aceita o convite' 'email_mismatch' "$OTHER" \
  "SELECT public.accept_agent_invite('$CODE_SUP2') ->> 'error'"
expect_value 'aceite com e-mail errado nao atribui papel' '0' \
  "SELECT count(*) FROM public.user_roles WHERE user_id = '$OTHER_UUID' AND role = 'supervisor'"

# convidado mente no JWT: o papel atribuido e o do CONVITE
expect_value_as 'admin cria um novo convite para o atendente' 'true' "$ADMIN" \
  "SELECT public.create_agent_invite('agente@empresa.com', 'Agente', 'agent') ->> 'ok'"
CODE_AGENT2="$(psql_sql "SELECT code FROM public.agent_invitations WHERE email = 'agente@empresa.com' AND status = 'pending'")"
expect_value_as 'claims forjados (role=admin) nao viram papel' 'agent' "$LYING" \
  "SELECT public.accept_agent_invite('$CODE_AGENT2') ->> 'role'"
expect_value 'JWT forjado nao ganha admin' '0' \
  "SELECT count(*) FROM public.user_roles WHERE user_id = '$AGENT_UUID' AND role = 'admin'"

# convite expirado
expect_value_as 'admin cria convite para o quarto usuario' 'true' "$ADMIN" \
  "SELECT public.create_agent_invite('outro@empresa.com', 'Outro', 'supervisor') ->> 'ok'"
CODE_OLD="$(psql_sql "SELECT code FROM public.agent_invitations WHERE email = 'outro@empresa.com' AND status = 'pending'")"
psql_sql "UPDATE public.agent_invitations SET created_at = now() - interval '2 days', expires_at = now() - interval '1 hour' WHERE code = '$CODE_OLD'" >/dev/null
expect_value_as 'convite expirado nao aceita' 'invalid_or_expired_code' "$OTHER" \
  "SELECT public.accept_agent_invite('$CODE_OLD') ->> 'error'"
expect_value 'convite expirado nao atribui papel' '0' \
  "SELECT count(*) FROM public.user_roles WHERE user_id = '$OTHER_UUID' AND role = 'supervisor'"
OLD_ID="$(psql_sql "SELECT id FROM public.agent_invitations WHERE code = '$CODE_OLD'")"
expect_value_as 'list_agent_invites marca o convite vencido como expired' '1' "$ADMIN" \
  "SELECT count(*) FROM public.list_agent_invites(50) WHERE id = '$OLD_ID' AND status = 'expired'"

# --- leitura do estado: admin/supervisor sim, o resto nao ---
expect_value_as 'admin ve os convites com estado' 't' "$ADMIN" \
  "SELECT count(*) > 0 FROM public.list_agent_invites(50) WHERE status IN ('pending', 'used', 'expired')"
expect_value_as 'atendente comum nao ve convite nenhum' '0' "$AGENT" \
  "SELECT count(*) FROM public.list_agent_invites(50)"
expect_value_as 'supervisor ve os convites' 't' "$SUP" \
  "SELECT count(*) > 0 FROM public.list_agent_invites(50)"

printf '\n== BLOCO C — o Rollback do cabecalho desfaz a migration ==\n'
rollback_sql="$(sed -n '2s/^-- Rollback: //p' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'a migration nao tem a linha -- Rollback:'
psql_sql "$rollback_sql" >/dev/null
expect_value 'rollback remove a tabela de convites' 't' \
  "SELECT to_regclass('public.agent_invitations') IS NULL"
expect_value 'rollback remove create_agent_invite' 'f' \
  "SELECT to_regprocedure('public.create_agent_invite(text,text,text,integer)') IS NOT NULL"
expect_value 'rollback remove accept_agent_invite' 'f' \
  "SELECT to_regprocedure('public.accept_agent_invite(text)') IS NOT NULL"
expect_value 'rollback remove list_agent_invites' 'f' \
  "SELECT to_regprocedure('public.list_agent_invites(integer)') IS NOT NULL"
expect_value 'rollback nao leva dados de user_roles' '1' \
  "SELECT count(*) FROM public.user_roles WHERE user_id = '$AGENT_UUID' AND role = 'agent'"

printf '\n[OK] agent-invitations-flow: todas as assercoes passaram\n'
