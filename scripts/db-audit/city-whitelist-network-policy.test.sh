#!/usr/bin/env bash
# Bloqueio de login por CIDADE na RPC canônica resolve_network_policy (R2-AUTH-022).
#
# Prova, em PostgreSQL descartável, chamando a RPC REAL (nada de mock):
#
#   BLOCO A (VERMELHO) — estado anterior (só a migration 20261004182245): a RPC de 5
#     argumentos NÃO conhece cidade. Mesmo com cidade fora de qualquer lista, decide
#     "permitido" — o defeito (login passa por qualquer cidade).
#   BLOCO B (VERDE) — migration de cidade aplicada:
#       * nasce DESLIGADO (coluna default false; tabela vazia; login igual ao de hoje);
#       * ligado + cidade fora da lista nega ('city_blocked') mesmo com IP whitelisted e
#         país liberado (whitelist de IP NÃO isenta cidade);
#       * ligado + cidade ausente (NULL / vazia) falha fechado;
#       * ligado + lista vazia nega todos; entrada inativa não conta;
#       * normalização: caixa, acento e espaços repetidos casam;
#       * remover a cidade da lista volta a negar (lista é lida a cada decisão);
#       * a forma antiga de 5 argumentos deixou de existir (sem caminho sem cidade);
#       * SECURITY DEFINER, search_path fixo, GRANT só service_role;
#       * city_key é única (duplicata por normalização é rejeitada);
#       * IP bloqueado e país bloqueado continuam negando com a própria categoria;
#       * várias linhas em geo_blocking_settings: toggle e modo vêm da MESMA linha (a
#         mais recente), nunca de linhas diferentes.
#   MUTAÇÃO — numa CÓPIA da migration, remove o check de cidade e prova que o teste o
#     pega. Confirma por sha256 que o arquivo do repo nunca foi tocado.
#
# Roda via Docker local (Postgres descartável).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_migration="$repo_root/supabase/migrations/20261004182245_resolve_network_policy_rpc.sql"
migration="$repo_root/supabase/migrations/20261007022808_city_whitelist_network_policy.sql"
postgres_image="${CITY_POLICY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

main_container="zapp-v2-citypolicy-test-$$"
mut_container="zapp-v2-citypolicy-mut-$$"
target_container=""

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$base_migration" ]] || fail "migration base nao encontrada: $base_migration"
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

remove_container() {
  local name="$1"
  if [[ "$name" =~ ^zapp-v2-citypolicy-(test|mut)-[0-9]+$ ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}
cleanup() { remove_container "$main_container"; remove_container "$mut_container"; }
trap cleanup EXIT INT TERM

psql_sql() {
  docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

# Forma nova: (ip, país, cidade, endpoint, max, janela). Devolve `allowed|reason`.
rpc_row() {
  psql_sql "SELECT allowed||'|'||coalesce(reason,'NULL') FROM public.resolve_network_policy($1)"
}
expect_deny() {
  local label="$1" args="$2" reason="$3" row
  row="$(rpc_row "$args" | tail -n1)"
  [[ "$row" == "false|$reason" ]] || fail "$label: esperado 'false|$reason', obtido '$row'"
  printf '[PASS] %s\n' "$label"
}
expect_allow() {
  local label="$1" args="$2" row
  row="$(rpc_row "$args" | tail -n1)"
  [[ "$row" == "true|NULL" ]] || fail "$label: esperado 'true|NULL', obtido '$row'"
  printf '[PASS] %s\n' "$label"
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# Pre-state fiel: tabelas de configuração já existentes em produção + helper de admin.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.geo_blocking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled','whitelist','blacklist')),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.allowed_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.blocked_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  country_name text NOT NULL,
  reason text,
  blocked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text NOT NULL,
  blocked_by uuid REFERENCES auth.users(id),
  blocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_permanent boolean DEFAULT false,
  request_count integer DEFAULT 0,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ip_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  description text,
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rate_limit_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  endpoint_pattern text NOT NULL,
  max_requests integer NOT NULL DEFAULT 100,
  window_seconds integer NOT NULL DEFAULT 60,
  block_duration_minutes integer NOT NULL DEFAULT 15,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.geo_blocking_settings (mode) VALUES ('disabled');
INSERT INTO public.allowed_countries (country_code, country_name) VALUES ('BR', 'Brazil');
INSERT INTO public.blocked_countries (country_code, country_name) VALUES ('CN', 'China');
INSERT INTO public.blocked_ips (ip_address, reason) VALUES ('203.0.113.7', 'blocked test');
INSERT INTO public.ip_whitelist (ip_address, description) VALUES ('198.51.100.9', 'plain whitelist');
SQL

boot_container() {
  local name="$1"
  target_container="$name"
  docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
  local ready=0
  for _ in $(seq 1 90); do
    if psql_sql 'SELECT 1' >/dev/null 2>&1; then
      ready=$((ready + 1)); (( ready >= 2 )) && break
    else ready=0; fi
    sleep 1
  done
  (( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'
  psql_file "$tmp_dir/pre.sql"
  psql_file "$tmp_dir/seed.sql"
}

NEW_SIG="public.resolve_network_policy(text,text,text,text,integer,integer)"
OLD_SIG="public.resolve_network_policy(text,text,text,integer,integer)"

echo "===== BLOCO A (VERMELHO): só a RPC de 5 argumentos — cidade é ignorada ====="
boot_container "$main_container"
psql_file "$base_migration"
expect_value "RPC de cidade (6 args) AUSENTE (defeito)" "f" \
  "SELECT to_regprocedure('$NEW_SIG') IS NOT NULL"
expect_value "toggle city_whitelist_enabled AUSENTE (defeito)" "f" \
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='geo_blocking_settings' AND column_name='city_whitelist_enabled')"
expect_value "estado anterior permite qualquer cidade (login passa por cidade fora da lista)" "true" \
  "SELECT allowed::text FROM public.resolve_network_policy('1.1.1.1','BR','/x',30,60)"

echo "===== BLOCO B (VERDE): migration de cidade aplicada ====="
psql_file "$migration"

expect_value "RPC de 6 args existe" "t" "SELECT to_regprocedure('$NEW_SIG') IS NOT NULL"
expect_value "forma antiga de 5 args REMOVIDA (sem caminho sem cidade)" "f" \
  "SELECT to_regprocedure('$OLD_SIG') IS NOT NULL"
expect_value "é SECURITY DEFINER" "t" "SELECT prosecdef FROM pg_proc WHERE oid = '$NEW_SIG'::regprocedure"
expect_value "é STABLE" "s" "SELECT provolatile FROM pg_proc WHERE oid = '$NEW_SIG'::regprocedure"
expect_value "search_path fixo em public" "t" \
  "SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = '$NEW_SIG'::regprocedure"
expect_value "anon NÃO executa" "f" "SELECT has_function_privilege('anon', '$NEW_SIG', 'EXECUTE')"
expect_value "authenticated NÃO executa" "f" "SELECT has_function_privilege('authenticated', '$NEW_SIG', 'EXECUTE')"
expect_value "service_role executa" "t" "SELECT has_function_privilege('service_role', '$NEW_SIG', 'EXECUTE')"
expect_value "city_whitelist tem RLS ligado" "t" \
  "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.city_whitelist'::regclass"
expect_value "anon sem acesso à tabela" "f" \
  "SELECT has_table_privilege('anon', 'public.city_whitelist', 'SELECT')"

echo "-- Nasce desligado: login de hoje inalterado --"
expect_value "toggle da linha existente nasce false" "f" \
  "SELECT city_whitelist_enabled FROM public.geo_blocking_settings LIMIT 1"
expect_allow "desligado + cidade qualquer permite" "'1.1.1.1','BR','Cidade Qualquer','/x',30,60"
expect_allow "desligado + cidade ausente permite" "'1.1.1.1','BR',NULL,'/x',30,60"

echo "-- Ligado --"
psql_sql "INSERT INTO public.city_whitelist (city_name) VALUES ('São Paulo'), ('Curitiba')"
psql_sql "INSERT INTO public.city_whitelist (city_name, is_active) VALUES ('Manaus', false)"
psql_sql "UPDATE public.geo_blocking_settings SET city_whitelist_enabled = true, updated_at = now()"
expect_allow "ligado + cidade listada permite" "'1.1.1.1','BR','Curitiba','/x',30,60"
expect_deny  "ligado + cidade FORA da lista nega" "'1.1.1.1','BR','Rio de Janeiro','/x',30,60" "city_blocked"
expect_deny  "ligado + cidade ausente (NULL) falha fechado" "'1.1.1.1','BR',NULL,'/x',30,60" "city_blocked"
expect_deny  "ligado + cidade vazia falha fechado" "'1.1.1.1','BR','   ','/x',30,60" "city_blocked"
expect_deny  "ligado + entrada INATIVA não conta" "'1.1.1.1','BR','Manaus','/x',30,60" "city_blocked"
expect_deny  "whitelist de IP NÃO isenta cidade" "'198.51.100.9','BR','Rio de Janeiro','/x',30,60" "city_blocked"
expect_allow "caixa/acento/espaços normalizados (SAO   paulo)" "'1.1.1.1','BR','  SAO   paulo ','/x',30,60"
expect_allow "UTF-8 acentuado casa (São Paulo)" "'1.1.1.1','BR','São Paulo','/x',30,60"
expect_deny  "cidade parecida mas diferente nega (Sao Paulo Norte)" "'1.1.1.1','BR','Sao Paulo Norte','/x',30,60" "city_blocked"

echo "-- Lista é lida a cada decisão --"
psql_sql "DELETE FROM public.city_whitelist WHERE city_key = 'curitiba'"
expect_deny  "cidade removida da lista passa a negar" "'1.1.1.1','BR','Curitiba','/x',30,60" "city_blocked"
psql_sql "DELETE FROM public.city_whitelist"
expect_deny  "lista VAZIA com toggle ligado nega todos" "'1.1.1.1','BR','São Paulo','/x',30,60" "city_blocked"
psql_sql "INSERT INTO public.city_whitelist (city_name) VALUES ('São Paulo')"

echo "-- Categorias anteriores intactas --"
expect_deny  "IP bloqueado continua ip_blocked" "'203.0.113.7','BR','São Paulo','/x',30,60" "ip_blocked"
psql_sql "UPDATE public.geo_blocking_settings SET mode='blacklist', updated_at=now()"
expect_deny  "país bloqueado continua country_blocked (antes da cidade)" "'1.1.1.1','CN','Rio de Janeiro','/x',30,60" "country_blocked"
expect_allow "país liberado + cidade listada permite" "'1.1.1.1','BR','São Paulo','/x',30,60"
psql_sql "UPDATE public.geo_blocking_settings SET mode='disabled', updated_at=now()"

echo "-- Integridade da lista --"
expect_error "duplicata por normalização é rejeitada" "city_whitelist_city_key_key" \
  "INSERT INTO public.city_whitelist (city_name) VALUES ('  sao paulo ')"
expect_error "nome vazio é rejeitado" "city_whitelist_city_key_not_empty" \
  "INSERT INTO public.city_whitelist (city_name) VALUES ('   ')"

echo "-- Concorrência: toggle e modo vêm da MESMA linha de configuração --"
# Linha antiga (ligada) e linha nova (desligada, mais recente): vale só a mais recente.
psql_sql "INSERT INTO public.geo_blocking_settings (mode, city_whitelist_enabled, updated_at, created_at) VALUES ('disabled', false, now() + interval '1 minute', now() + interval '1 minute')"
expect_allow "linha mais recente (desligada) prevalece sobre a antiga (ligada)" "'1.1.1.1','BR','Rio de Janeiro','/x',30,60"
psql_sql "UPDATE public.geo_blocking_settings SET city_whitelist_enabled = true, updated_at = now() + interval '2 minutes' WHERE city_whitelist_enabled = false"
expect_deny  "religar a linha mais recente volta a negar" "'1.1.1.1','BR','Rio de Janeiro','/x',30,60" "city_blocked"

echo "-- Validação de entrada --"
expect_error "p_ip vazio levanta exceção" "p_ip obrigatorio" \
  "SELECT * FROM public.resolve_network_policy('', 'BR', 'X', '/x', 30, 60)"

echo "===== MUTAÇÃO: remover o check de cidade (o teste deve pegá-la) ====="
sed "s/if coalesce(v_city_enabled, false) then/if false then/" "$migration" > "$tmp_dir/mut.sql"
grep -q "if false then" "$tmp_dir/mut.sql" || fail 'mutacao nao aplicada na copia'
grep -q "if coalesce(v_city_enabled, false) then" "$migration" || fail 'original foi tocado'
orig_sha="$(sha256sum "$migration" | cut -d' ' -f1)"
boot_container "$mut_container"
psql_file "$base_migration"
psql_file "$tmp_dir/mut.sql"
psql_sql "UPDATE public.geo_blocking_settings SET city_whitelist_enabled = true"
mut_row="$(rpc_row "'1.1.1.1','BR','Rio de Janeiro','/x',30,60" | tail -n1)"
[[ "$mut_row" == "true|NULL" ]] || fail "mutacao deveria deixar cidade fora da lista passar, obtido '$mut_row'"
printf '[PASS] mutação: sem o check, cidade fora da lista passa (o teste a pega)\n'
now_sha="$(sha256sum "$migration" | cut -d' ' -f1)"
[[ "$orig_sha" == "$now_sha" ]] || fail 'sha256 da migration mudou durante o teste'
printf '[PASS] sha256 da migration do repo preservado (%s)\n' "${now_sha:0:16}"

echo ""
echo "OK — bloqueio por cidade na RPC canônica verificado (red → green + mutação)."
