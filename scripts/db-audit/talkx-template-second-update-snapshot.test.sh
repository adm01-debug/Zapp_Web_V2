#!/usr/bin/env bash
# Harness descartavel (postgres:17-alpine) que prova o segundo UPDATE do
# template nao e rejeitado pela guarda de snapshot da RPC.
#
# O defeito: guard_talkx_template_update() comparava
# history.created_at = statement_timestamp(). Cada chamada RPC gera um
# statement_timestamp() diferente, entao o segundo UPDATE nao encontra o
# snapshot da primeira chamada e e rejeitado.
#
# A correcao (migration 20261010120002) troca statement_timestamp() por
# transaction_timestamp() em dois lugares:
#   1) v_updated_at em update_talkx_template_with_snapshot
#   2) a comparacao da guarda em guard_talkx_template_update()
#
# transaction_timestamp() e constante dentro da transacao, entao ambas as
# chamadas (primeira e segunda) encontram o mesmo instante e a guarda
# localiza o snapshot criado pela primeira chamada.
#
# Provas:
#   RED  — sem a migration de correção, o segundo UPDATE e rejeitado
#          (snapshot nao encontrado pela guarda).
#   GREEN — com a migration de correção, o segundo UPDATE e aceito e
#           o template e atualizado com sucesso.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_fix="${TALKX_SNAPSHOT_FIX_MIGRATION:-$repo_root/supabase/migrations/20261010120002_fix_guard_talkx_template_update_snapshot.sql}"
migration_base="${TALKX_SNAPSHOT_BASE_MIGRATION:-$repo_root/supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql}"
postgres_image="${TALKX_SNAPSHOT_POSTGRES_IMAGE:-postgres:17-alpine}"
tmp_dir="${TALKX_SNAPSHOT_TMPDIR:-${TMPDIR:-$repo_root/.tmp}}"

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
ok() { printf '[OK] %s\n' "$1"; }
brief() {
  local filtered
  filtered="$(printf '%s' "$1" | grep -E '^(ERROR|DETAIL|HINT|FALHA|NOTICE)' | head -4 | tr '\n' ' ' || true)"
  if [[ -n "$filtered" ]]; then printf '%s' "$filtered"; else printf '%s' "${1:0:400}"; fi
}

cid=''
work_dir=''
containers=()
cleanup() {
  local c
  for c in "${containers[@]:-}"; do
    if [[ "$c" =~ ^talkx-snap- ]]; then docker rm -f "$c" >/dev/null 2>&1 || true; fi
  done
  if [[ -n "$work_dir" && "$work_dir" == "$tmp_dir"/talkx-snap-mut.* ]]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
[[ -f "$migration_fix" ]] || fail "migration de correcao nao encontrada: $migration_fix"
[[ -f "$migration_base" ]] || fail "migration base nao encontrada: $migration_base"
[[ -n "$tmp_dir" && "$tmp_dir" != '/' ]] || fail "TMPDIR invalido: '$tmp_dir'"
mkdir -p "$tmp_dir"
work_dir="$(mktemp -d "$tmp_dir/talkx-snap-mut.XXXXXX")"

test_password='talkx_snap_test_only'
bootstrap_user='supabase_admin'
applier_user='postgres'
db_name='postgres'
template_id='a0000000-0000-0000-0000-000000000001'
user_id='b0000000-0000-0000-0000-000000000001'
profile_id='c0000000-0000-0000-0000-000000000001'

psql_test()   { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U "$applier_user" -d "$db_name" "$@"; }
psql_strict() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U "$bootstrap_user" -d "$db_name" "$@"; }

# run_rpc: executa uma RPC como authenticated dentro de uma transacao.
# Captura stderr em arquivo separado (NAO usa 2>&1) para nao contaminar
# o resultado da RPC com mensagens de log do psql.
# Args: <sql-file>
# Returns: stdout da RPC (resultado limpo) em $rpc_result; stderr em $rpc_stderr_file.
rpc_stderr_file=''
run_rpc() {
  local sql_file="$1"
  rpc_stderr_file="$(mktemp "$work_dir/rpc-stderr-XXXXXX")"
  local out
  out="$(docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U "$applier_user" -d "$db_name" <<SQL 2>"$rpc_stderr_file"
BEGIN;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '$user_id';
SET LOCAL ROLE authenticated;
$(cat "$sql_file")
COMMIT;
SQL
)"
  rpc_result="$out"
}

new_container() {
  local name="talkx-snap-$RANDOM$RANDOM" ready=false
  docker run --rm -d --name "$name" \
    -e POSTGRES_PASSWORD="$test_password" \
    -e POSTGRES_USER="$bootstrap_user" \
    -e POSTGRES_DB="$db_name" \
    "$postgres_image" >/dev/null
  containers+=("$name")
  cid="$name"
  for _ in $(seq 1 90); do
    if [[ "$(docker logs "$name" 2>&1 | grep -c 'database system is ready to accept connections' || true)" -ge 2 ]] \
       && docker exec "$name" psql -X -U "$bootstrap_user" -d "$db_name" -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true; break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] || fail "PostgreSQL descartavel nao ficou pronto ($name)"
}

apply_migration() {
  local file="$1"
  { printf 'SELECT public.__applier_exec_sql($talkx_migration$\n'
    cat "$file"
    printf '\n$talkx_migration$);\n'
  } | docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U authenticator -d "$db_name" 2>&1
}

setup_fixture() {
  psql_strict >/dev/null <<'SQL'
SET client_min_messages TO warning;
CREATE ROLE service_role NOLOGIN NOSUPERUSER;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER;
CREATE ROLE anon NOLOGIN NOSUPERUSER;
CREATE ROLE authenticator LOGIN NOSUPERUSER NOINHERIT;
CREATE ROLE talkx_owner NOLOGIN NOSUPERUSER;
CREATE ROLE postgres LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT service_role, authenticated, anon TO authenticator;
GRANT service_role TO postgres;
GRANT anon, authenticated TO postgres;
GRANT talkx_owner TO postgres;
GRANT CREATE ON SCHEMA public TO talkx_owner;
ALTER DATABASE postgres OWNER TO postgres;
SET ROLE postgres;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO service_role, authenticated, anon;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
GRANT SELECT ON auth.users TO service_role, authenticated, anon;

CREATE SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  role text DEFAULT 'user'
);
GRANT ALL ON public.profiles TO service_role, authenticated, anon;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(p_user_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM public.profiles WHERE id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT false;
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  category text NOT NULL,
  content text NOT NULL,
  media_url text,
  media_type text,
  tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  custom_variables text[] DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT transaction_timestamp(),
  updated_at timestamptz DEFAULT transaction_timestamp(),
  use_count integer DEFAULT 0
);
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.talkx_templates TO service_role, authenticated, anon;

CREATE TABLE public.talkx_template_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  description text,
  content text NOT NULL,
  category text NOT NULL,
  status text NOT NULL,
  media_url text,
  media_type text,
  tags text[] DEFAULT '{}',
  custom_variables text[] DEFAULT '{}',
  saved_by uuid NOT NULL,
  created_at timestamptz NOT NULL
);
ALTER TABLE public.talkx_template_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.talkx_template_versions TO service_role, authenticated, anon;

INSERT INTO public.profiles (id, display_name, role) VALUES ('$profile_id', 'Test User', 'user');
INSERT INTO auth.users (id, email) VALUES ('$user_id', 'test@example.com');
INSERT INTO public.talkx_templates (id, name, description, category, content, media_url, media_type, tags, status, custom_variables, created_by)
  VALUES ('$template_id', 'Template Original', 'Descricao original', 'marketing', 'Conteudo Original', NULL, NULL, '{}', 'draft', '{}', '$profile_id');
SQL
}

# ---------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------
run_case_red() {
  local out
  new_container
  setup_fixture
  # Aplica só a migration base (sem a correcao da guarda).
  apply_migration "$migration_base" >/dev/null 2>&1
  # Primeira chamada: deve ter sucesso.
  cat > "$work_dir/first-update.sql" <<SQL
SELECT template_id::text || '|' || updated_at::text || '|' || version_number::text
  FROM public.update_talkx_template_with_snapshot(
    '$template_id',
    (SELECT updated_at FROM public.talkx_templates WHERE id='$template_id'),
    'Template Atualizado 1',
    'Descricao atualizada',
    'marketing',
    'Conteudo Atualizado 1',
    NULL, NULL, '{}'::text[], 'approved', '{}'::text[]);
SQL
  run_rpc "$work_dir/first-update.sql"
  first_result="$rpc_result"
  [[ -n "$first_result" ]] || fail "RED: primeira chamada nao retornou resultado (stderr: $(cat "$rpc_stderr_file"))"

  # Segunda chamada: sem a correcao, a guarda rejeita com snapshot nao encontrado.
  second_updated_at="$(printf '%s' "$first_result" | cut -d'|' -f2)"
  cat > "$work_dir/second-update.sql" <<SQL
SELECT template_id::text || '|' || updated_at::text || '|' || version_number::text
  FROM public.update_talkx_template_with_snapshot(
    '$template_id',
    '$second_updated_at'::timestamptz,
    'Template Atualizado 2',
    'Descricao atualizada 2',
    'marketing',
    'Conteudo Atualizado 2',
    NULL, NULL, '{}'::text[], 'approved', '{}'::text[]);
SQL
  run_rpc "$work_dir/second-update.sql"
  second_result="$rpc_result"
  second_stderr="$(cat "$rpc_stderr_file")"
  # Sem a correcao, a guarda rejeita o segundo UPDATE.
  [[ "$second_result" == *'snapshot'* || "$second_stderr" == *'snapshot'* || "$second_result" == *'guard'* || "$second_stderr" == *'guard'* ]] \
    || fail "RED: esperava que o segundo UPDATE fosse rejeitado pela guarda de snapshot (resultado: '$second_result', stderr: '$(brief "$second_stderr")')"
  ok "RED: o segundo UPDATE foi rejeitado pela guarda de snapshot (sem a correcao) — reproduz o defeito."
}

run_case_green() {
  local out
  new_container
  setup_fixture
  # Aplica a migration base + a correcao.
  apply_migration "$migration_base" >/dev/null 2>&1
  apply_migration "$migration_fix" >/dev/null 2>&1
  # Primeira chamada.
  cat > "$work_dir/first-update.sql" <<SQL
SELECT template_id::text || '|' || updated_at::text || '|' || version_number::text
  FROM public.update_talkx_template_with_snapshot(
    '$template_id',
    (SELECT updated_at FROM public.talkx_templates WHERE id='$template_id'),
    'Template Atualizado 1',
    'Descricao atualizada',
    'marketing',
    'Conteudo Atualizado 1',
    NULL, NULL, '{}'::text[], 'approved', '{}'::text[]);
SQL
  run_rpc "$work_dir/first-update.sql"
  first_result="$rpc_result"
  [[ -n "$first_result" ]] || fail "GREEN: primeira chamada nao retornou resultado (stderr: $(cat "$rpc_stderr_file"))"

  # Segunda chamada: com a correcao, deve ter sucesso.
  second_updated_at="$(printf '%s' "$first_result" | cut -d'|' -f2)"
  cat > "$work_dir/second-update.sql" <<SQL
SELECT template_id::text || '|' || updated_at::text || '|' || version_number::text
  FROM public.update_talkx_template_with_snapshot(
    '$template_id',
    '$second_updated_at'::timestamptz,
    'Template Atualizado 2',
    'Descricao atualizada 2',
    'marketing',
    'Conteudo Atualizado 2',
    NULL, NULL, '{}'::text[], 'approved', '{}'::text[]);
SQL
  run_rpc "$work_dir/second-update.sql"
  second_result="$rpc_result"
  second_stderr="$(cat "$rpc_stderr_file")"
  [[ -n "$second_result" ]] || fail "GREEN: o segundo UPDATE falhou apos a correcao (stderr: $(brief "$second_stderr"))"
  [[ "$second_result" == *'|2|'* ]] || fail "GREEN: o segundo UPDATE deveria devolver version_number=2 (got '$second_result')"

  # Confirma o conteudo vivo foi atualizado.
  live_content="$(psql_test -Atqc "SELECT content FROM public.talkx_templates WHERE id='$template_id'")"
  [[ "$live_content" == 'Conteudo Atualizado 2' ]] || fail "GREEN: o conteudo VIVO deveria ser 'Conteudo Atualizado 2' (got '$live_content')"

  # Confirma o snapshot foi criado pela primeira chamada e a guarda nao o bloqueou.
  snap_count="$(psql_test -Atqc "SELECT count(*) FROM public.talkx_template_versions WHERE template_id='$template_id'")"
  [[ "$snap_count" == '2' ]] || fail "GREEN: deveria existir exatamente 2 snapshots (got $snap_count)"

  ok "GREEN: o segundo UPDATE e aceito apos a correcao (transaction_timestamp na guarda), template atualizado e 2 snapshots criados."
}

# ---------------------------------------------------------------------------
# Execucao
# ---------------------------------------------------------------------------
printf '== talkx-template-second-update-snapshot: harness (postgres:17-alpine) ==\n'
printf 'Migration de correcao: %s\n' "$migration_fix"
printf 'Migration base:       %s\n' "$migration_base"

printf '\n-- RED: sem a correcao, o segundo UPDATE e rejeitado pela guarda --\n'
run_case_red

printf '\n-- GREEN: com a correcao, o segundo UPDATE e aceito --\n'
run_case_green

printf '\n'
ok 'talkx-template-second-update-snapshot: RED reproduz o defeito (segundo UPDATE rejeitado) e GREEN prova a correcao (transaction_timestamp na guarda permite o segundo UPDATE).'