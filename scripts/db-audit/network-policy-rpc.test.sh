#!/usr/bin/env bash
# R2-AUTH-022 / item 27.1 — contrato comportamental da RPC canônica de política de rede.
#
# Prova, em PostgreSQL descartável, que a fronteira de decisão que faltava (o defeito
# do achado: a UI persiste geo_blocking_settings/blocked_ips/ip_whitelist/rate_limit_configs
# mas NENHUM caminho de acesso as lê) passa a existir e decide corretamente:
#
#   BLOCO A (VERMELHO) — estado anterior: as tabelas de configuração existem, mas a RPC
#     canônica `resolve_network_policy` NÃO existe. Prova o defeito (config sem consumidor).
#   BLOCO B (VERDE) — migration aplicada: a RPC existe (SECURITY DEFINER, search_path fixo,
#     grants mínimos) e decide:
#       * IP explicitamente bloqueado nega; whitelist isenta SOMENTE o bloqueio por IP
#         (não isenta país); IP ao mesmo tempo bloqueado e whitelisted passa.
#       * país: disabled permite; blacklist nega listados; whitelist permite apenas listados;
#         whitelist vazia e país ausente em modo ativo falham fechados.
#       * rate limit: regra ativa que casa (exato ou glob '*') prevalece sobre o default;
#         glob mais específico vence; regra inativa é ignorada; sem regra usa o default.
#       * entrada inválida (p_ip vazio) levanta exceção.
#   MUTAÇÃO — remove a isenção de whitelist numa CÓPIA da migration e prova que o teste
#     a pega (a asserção de whitelist fica VERMELHA). Confirma por sha256 que o arquivo
#     do repo NUNCA foi tocado.
#
# NAO entra no CI (github workflows são território do Joaquim). Roda via Docker local.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261004182245_resolve_network_policy_rpc.sql"
postgres_image="${NETWORK_POLICY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"

main_container="zapp-v2-netpolicy-test-$$"
mut_container="zapp-v2-netpolicy-mut-$$"
target_container=""

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

remove_container() {
  local name="$1"
  if [[ "$name" =~ ^zapp-v2-netpolicy-(test|mut)-[0-9]+$ ]]; then
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

# Resolve a RPC e devolve `allowed|reason|max|window` (NULL de reason vira a string 'NULL').
rpc_row() {
  psql_sql "SELECT allowed||'|'||coalesce(reason,'NULL')||'|'||rate_limit_max_requests||'|'||rate_limit_window_seconds FROM public.resolve_network_policy($1)"
}
expect_deny() {
  local label="$1" args="$2" reason="$3" row
  row="$(rpc_row "$args" | tail -n1)"
  [[ "$row" == "false|$reason|"* ]] || fail "$label: esperado 'false|$reason|...', obtido '$row'"
  printf '[PASS] %s\n' "$label"
}
expect_allow() {
  local label="$1" args="$2" max="$3" window="$4" row
  row="$(rpc_row "$args" | tail -n1)"
  [[ "$row" == "true|NULL|$max|$window" ]] || fail "$label: esperado 'true|NULL|$max|$window', obtido '$row'"
  printf '[PASS] %s\n' "$label"
}

# ---------------------------------------------------------------------------
# Pre-state fiel ao banco: só as tabelas de configuração (sem a fronteira canônica).
# ---------------------------------------------------------------------------
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

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
INSERT INTO public.allowed_countries (country_code, country_name) VALUES
  ('BR', 'Brazil'), ('US', 'United States');
INSERT INTO public.blocked_countries (country_code, country_name) VALUES
  ('CN', 'China'), ('RU', 'Russia');
INSERT INTO public.blocked_ips (ip_address, reason) VALUES
  ('203.0.113.7', 'blocked test'),
  ('203.0.113.8', 'blocked AND whitelisted');
INSERT INTO public.ip_whitelist (ip_address, description) VALUES
  ('198.51.100.9', 'plain whitelist'),
  ('203.0.113.8', 'whitelist wins over block');
INSERT INTO public.rate_limit_configs (name, endpoint_pattern, max_requests, window_seconds, is_active) VALUES
  ('Login',        '/auth/login', 5, 300, true),
  ('Auth glob',    '/auth/*',     50, 60, true),
  ('Messages inat', '/messages/*', 7, 120, false),
  ('API glob',     '/api/*',      100, 60, true),
  ('Glob curto',   '/glob/*',     10, 10, true),
  ('Glob especifico', '/glob/sub/*', 20, 20, true);
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

echo "===== BLOCO A (VERMELHO): config existe, fronteira canônica ausente ====="
boot_container "$main_container"
expect_value "tabela geo_blocking_settings existe (config sem consumidor)" "t" \
  "SELECT to_regclass('public.geo_blocking_settings') IS NOT NULL"
expect_value "tabela rate_limit_configs existe (config sem consumidor)" "t" \
  "SELECT to_regclass('public.rate_limit_configs') IS NOT NULL"
expect_value "RPC canônica resolve_network_policy AUSENTE (defeito)" "f" \
  "SELECT to_regprocedure('public.resolve_network_policy(text,text,text,integer,integer)') IS NOT NULL"

echo "===== BLOCO B (VERDE): migration aplicada ====="
psql_file "$migration"

expect_value "RPC canônica agora EXISTE" "t" \
  "SELECT to_regprocedure('public.resolve_network_policy(text,text,text,integer,integer)') IS NOT NULL"
expect_value "é SECURITY DEFINER" "t" \
  "SELECT prosecdef FROM pg_proc WHERE oid = 'public.resolve_network_policy(text,text,text,integer,integer)'::regprocedure"
expect_value "é STABLE (sem efeito colateral)" "s" \
  "SELECT provolatile FROM pg_proc WHERE oid = 'public.resolve_network_policy(text,text,text,integer,integer)'::regprocedure"
expect_value "search_path fixo em public" "t" \
  "SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = 'public.resolve_network_policy(text,text,text,integer,integer)'::regprocedure"
expect_value "anon NÃO executa" "f" \
  "SELECT has_function_privilege('anon', 'public.resolve_network_policy(text,text,text,integer,integer)', 'EXECUTE')"
expect_value "authenticated NÃO executa" "f" \
  "SELECT has_function_privilege('authenticated', 'public.resolve_network_policy(text,text,text,integer,integer)', 'EXECUTE')"
expect_value "service_role executa" "t" \
  "SELECT has_function_privilege('service_role', 'public.resolve_network_policy(text,text,text,integer,integer)', 'EXECUTE')"

echo "-- Política de IP --"
expect_deny  "IP bloqueado nega" "'203.0.113.7','BR','/x',30,60" "ip_blocked"
expect_allow "IP whitelisted passa (geo disabled)" "'198.51.100.9','BR','/x',30,60" 30 60
expect_allow "IP bloqueado E whitelisted: whitelist vence" "'203.0.113.8','BR','/x',30,60" 30 60
expect_deny  "IP bloqueado com limite de regra resolvido" "'203.0.113.7','BR','/auth/login',30,60" "ip_blocked"

echo "-- Política de país --"
psql_sql "UPDATE public.geo_blocking_settings SET mode='blacklist', updated_at=now()"
expect_deny  "blacklist nega país listado (CN)" "'1.1.1.1','CN','/x',30,60" "country_blocked"
expect_allow "blacklist permite país fora da lista (BR)" "'1.1.1.1','BR','/x',30,60" 30 60
expect_deny  "blacklist + país ausente falha fechado" "'1.1.1.1',NULL,'/x',30,60" "country_blocked"
psql_sql "UPDATE public.geo_blocking_settings SET mode='whitelist', updated_at=now()"
expect_allow "whitelist permite país listado (BR)" "'1.1.1.1','BR','/x',30,60" 30 60
expect_deny  "whitelist nega país fora da lista (CN)" "'1.1.1.1','CN','/x',30,60" "country_blocked"
expect_deny  "whitelist + país ausente falha fechado" "'1.1.1.1',NULL,'/x',30,60" "country_blocked"
expect_deny  "whitelist de IP NÃO isenta país (IP wl + país fora)" "'198.51.100.9','CN','/x',30,60" "country_blocked"
psql_sql "DELETE FROM public.allowed_countries"
expect_deny  "whitelist VAZIA nega todos" "'1.1.1.1','BR','/x',30,60" "country_blocked"
psql_sql "UPDATE public.geo_blocking_settings SET mode='disabled', updated_at=now()"
expect_allow "disabled permite qualquer país (mesmo em blocked)" "'1.1.1.1','CN','/x',30,60" 30 60

echo "-- Rate limit configurável --"
expect_allow "regra exata ativa prevalece (/auth/login -> 5/300)" "'1.1.1.1','BR','/auth/login',30,60" 5 300
expect_allow "glob casa (/api/foo -> /api/* -> 100/60)" "'1.1.1.1','BR','/api/foo',30,60" 100 60
expect_allow "exato vence glob (/auth/login: exato 5/300 > glob 50/60)" "'1.1.1.1','BR','/auth/login',30,60" 5 300
expect_allow "glob mais específico vence (/glob/sub/x -> /glob/sub/* -> 20/20)" "'1.1.1.1','BR','/glob/sub/x',30,60" 20 20
expect_allow "glob curto quando só ele casa (/glob/other -> /glob/* -> 10/10)" "'1.1.1.1','BR','/glob/other',30,60" 10 10
expect_allow "regra INATIVA ignorada (/messages/* inativo -> default)" "'1.1.1.1','BR','/messages/123',30,60" 30 60
expect_allow "sem regra usa o default do chamador" "'1.1.1.1','BR','/nenhum',30,60" 30 60

echo "-- Validação de entrada --"
expect_error "p_ip vazio levanta exceção" "p_ip obrigatorio" \
  "SELECT * FROM public.resolve_network_policy('', 'BR', '/x', 30, 60)"

echo "===== MUTAÇÃO: remover isenção de whitelist (o teste deve pegá-la) ====="
sed "s/if not v_ip_whitelisted then/if true then/" "$migration" > "$tmp_dir/mut.sql"
# garante que a mutação de fato alterou a cópia (e não o original)
grep -q "if true then" "$tmp_dir/mut.sql" || fail 'mutacao nao aplicada na copia'
grep -q "if not v_ip_whitelisted then" "$migration" || fail 'original foi tocado (whitelist)'
orig_sha="$(sha256sum "$migration" | cut -d' ' -f1)"
boot_container "$mut_container"
psql_file "$tmp_dir/mut.sql"
mut_row="$(rpc_row "'203.0.113.8','BR','/x',30,60" | tail -n1)"
[[ "$mut_row" == "false|ip_blocked|"* ]] || fail "mutacao deveria tornar whitelist inerte e negar 203.0.113.8, obtido '$mut_row'"
printf '[PASS] mutação: sem isenção de whitelist, IP bloqueado+whitelisted é negado (o teste a pega)\n'
now_sha="$(sha256sum "$migration" | cut -d' ' -f1)"
[[ "$orig_sha" == "$now_sha" ]] || fail 'sha256 da migration mudou durante o teste'
printf '[PASS] sha256 da migration do repo preservado (%s)\n' "${now_sha:0:16}"

echo ""
echo "OK — contrato da RPC canônica de política de rede verificado (red → green + mutação)."
