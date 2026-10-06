#!/usr/bin/env bash
# auth-login — RPC única consume_login_gate (cartão t_9d4452e2, retomada de #113).
#
# Prova, em PostgreSQL descartável (postgres:17-alpine), o defeito e a correção:
#
#   BLOCO A (VERMELHO) — estado anterior: a RPC NÃO existe e a sequência antiga
#     (consume_rate_limit do IP + consume_rate_limit do e-mail + is_account_locked,
#     em três chamadas) CONSOME os dois contadores antes de descobrir que a conta
#     está travada.
#   BLOCO B (VERDE) — migration aplicada: consume_login_gate
#       * verifica o bloqueio ANTES de consumir contadores (conta travada responde
#         is_locked sem gastar IP nem e-mail);
#       * respeita os tetos de IP e de e-mail; teto de IP NÃO consome e-mail;
#       * p_email NULL (corpo inválido) contabiliza apenas o IP;
#       * as duas escritas são atômicas com a transação do chamador;
#       * só service_role executa (anon e authenticated recebem permission denied);
#       * entrada inválida levanta exceção;
#       * p95 da chamada única < p95 da sequência antiga de três chamadas
#         (medido no cliente, mesma sessão psql, \timing por statement).
#
# NAO entra no CI direto (workflows são do dono do workflow): registrada na
# ALLOWLIST de scripts/ci/check-test-inventory.mjs. Roda via Docker local.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$(ls "$repo_root"/supabase/migrations/*_login_gate_rpc.sql | head -n1)"
postgres_image="${LOGIN_GATE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-login-gate-test-$$"
bench_n="${LOGIN_GATE_BENCH_N:-300}"

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-login-gate-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada (esperava *_login_gate_rpc.sql)"

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_role() {
  local role="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $role; $sql"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_error_role() {
  local label="$1" needle="$2" role="$3" sql="$4" output status
  set +e
  output="$(as_role "$role" "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

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

# ---------------------------------------------------------------------------
# Pre-state fiel ao banco ANTES da migration: edge_rate_limits + consume_rate_limit
# (20260905020000_edge_rate_limits.sql, sem o cron.schedule — pg_cron não existe
# na imagem descartável) e login_attempts + is_account_locked
# (20251231132448_8f744f22-eacc-43e9-be5b-8b194737c75d.sql).
# ---------------------------------------------------------------------------
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.edge_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.edge_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)
 RETURNS TABLE(allowed boolean, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.edge_rate_limits AS r (key, window_start, hits, updated_at)
  VALUES (p_key, now(), 1, now())
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE
          WHEN r.window_start + make_interval(secs => p_window_seconds) <= now() THEN 1
          ELSE r.hits + 1
        END,
        window_start = CASE
          WHEN r.window_start + make_interval(secs => p_window_seconds) <= now() THEN now()
          ELSE r.window_start
        END,
        updated_at = now()
  RETURNING r.hits INTO v_hits;

  RETURN QUERY SELECT v_hits <= p_max, GREATEST(p_max - v_hits, 0);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

CREATE TABLE public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email)
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_account_locked(check_email TEXT)
RETURNS TABLE(is_locked BOOLEAN, locked_until TIMESTAMP WITH TIME ZONE, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt RECORD;
BEGIN
  SELECT la.attempt_count, la.locked_until, la.last_attempt_at
  INTO v_attempt
  FROM public.login_attempts la
  WHERE la.email = LOWER(check_email);

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, 0;
    RETURN;
  END IF;

  IF v_attempt.locked_until IS NOT NULL AND v_attempt.locked_until > now() THEN
    RETURN QUERY SELECT true, v_attempt.locked_until, v_attempt.attempt_count;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::TIMESTAMP WITH TIME ZONE, v_attempt.attempt_count;
END;
$$;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value 'A.1 RPC consume_login_gate AUSENTE (defeito)' 'f' \
  "SELECT to_regprocedure('public.consume_login_gate(text,text,integer,integer,integer,integer)') IS NOT NULL"

# Conta travada E a sequência antiga mesmo assim consome os dois contadores:
# era o que o handler fazia (IP -> e-mail -> is_account_locked, três chamadas).
psql_sql "INSERT INTO public.login_attempts (email, attempt_count, locked_until)
          VALUES ('travada@x.com', 5, now() + interval '10 minutes')" >/dev/null
psql_sql "SELECT allowed FROM public.consume_rate_limit('auth-login:192.0.2.10', 10, 60);
          SELECT allowed FROM public.consume_rate_limit('auth-login-email:travada@x.com', 20, 60);
          SELECT is_locked FROM public.is_account_locked('travada@x.com');" >/dev/null
expect_value 'A.2 (DEFEITO) sequência antiga consumiu o contador de IP mesmo com conta travada' '1' \
  "SELECT hits FROM public.edge_rate_limits WHERE key='auth-login:192.0.2.10'"
expect_value 'A.3 (DEFEITO) sequência antiga consumiu o contador de e-mail mesmo com conta travada' '1' \
  "SELECT hits FROM public.edge_rate_limits WHERE key='auth-login-email:travada@x.com'"
expect_value 'A.4 (DEFEITO) o bloqueio só era descoberto na TERCEIRA chamada' 't' \
  "SELECT is_locked FROM public.is_account_locked('travada@x.com')"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
psql_sql "DELETE FROM public.edge_rate_limits" >/dev/null

expect_value 'B.1 RPC consume_login_gate agora EXISTE' 't' \
  "SELECT to_regprocedure('public.consume_login_gate(text,text,integer,integer,integer,integer)') IS NOT NULL"
expect_value 'B.2 é SECURITY DEFINER' 't' \
  "SELECT prosecdef FROM pg_proc WHERE oid = 'public.consume_login_gate(text,text,integer,integer,integer,integer)'::regprocedure"
expect_value 'B.3 search_path fixo em public' 't' \
  "SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = 'public.consume_login_gate(text,text,integer,integer,integer,integer)'::regprocedure"
expect_value 'B.4 anon NÃO tem EXECUTE' 'f' \
  "SELECT has_function_privilege('anon', 'public.consume_login_gate(text,text,integer,integer,integer,integer)', 'EXECUTE')"
expect_value 'B.5 authenticated NÃO tem EXECUTE' 'f' \
  "SELECT has_function_privilege('authenticated', 'public.consume_login_gate(text,text,integer,integer,integer,integer)', 'EXECUTE')"
expect_value 'B.6 PUBLIC NÃO tem EXECUTE (proacl explícita, sem entrada de grantee vazio)' 't' \
  "SELECT proacl IS NOT NULL AND proacl::text !~ '(^|\{|,)=X' FROM pg_proc WHERE oid = 'public.consume_login_gate(text,text,integer,integer,integer,integer)'::regprocedure"
expect_value 'B.7 service_role tem EXECUTE' 't' \
  "SELECT has_function_privilege('service_role', 'public.consume_login_gate(text,text,integer,integer,integer,integer)', 'EXECUTE')"

expect_error_role 'B.8 authenticated chamando a RPC recebe permission denied' \
  'permission denied' 'authenticated' \
  "SELECT * FROM public.consume_login_gate('a@b.com','10.1.1.1',10,60,20,60)"

row="$(as_role service_role "SELECT is_locked||'|'||attempts FROM public.consume_login_gate('travada@x.com','192.0.2.20',10,60,20,60)" | tail -n1)"
[[ "$row" == "true|5" ]] || fail "B.9 conta travada deveria responder is_locked=t attempts=5, obtido '$row'"
printf '[PASS] %s\n' 'B.9 conta travada responde is_locked=true como service_role'
expect_value 'B.10 conta travada NÃO consumiu contador de IP' '0' \
  "SELECT count(*) FROM public.edge_rate_limits WHERE key='auth-login:192.0.2.20'"
expect_value 'B.11 conta travada NÃO consumiu contador de e-mail' '0' \
  "SELECT count(*) FROM public.edge_rate_limits WHERE key='auth-login-email:travada@x.com'"

expect_value 'B.12 IP dentro do teto: 1ª chamada allowed' 't' \
  "SELECT allowed FROM public.consume_login_gate('ipok@x.com','10.0.0.1',2,60,20,60)"
expect_value 'B.13 IP dentro do teto: 2ª chamada allowed' 't' \
  "SELECT allowed FROM public.consume_login_gate('ipok@x.com','10.0.0.1',2,60,20,60)"
expect_value 'B.14 IP no teto: 3ª chamada denied (429 no chamador)' 'f' \
  "SELECT allowed FROM public.consume_login_gate('ipok@x.com','10.0.0.1',2,60,20,60)"
expect_value 'B.15 teto de IP NÃO consumiu e-mail no deny (hits ficou em 2, das permitidas)' '2' \
  "SELECT hits FROM public.edge_rate_limits WHERE key='auth-login-email:ipok@x.com'"
expect_value 'B.16 contador de IP ficou em 3 hits' '3' \
  "SELECT hits FROM public.edge_rate_limits WHERE key='auth-login:10.0.0.1'"

expect_value 'B.17 e-mail dentro do teto: 1ª chamada allowed' 't' \
  "SELECT allowed FROM public.consume_login_gate('emteto@x.com','10.0.0.2',10,60,2,60)"
expect_value 'B.18 e-mail dentro do teto: 2ª chamada allowed' 't' \
  "SELECT allowed FROM public.consume_login_gate('emteto@x.com','10.0.0.2',10,60,2,60)"
expect_value 'B.19 e-mail no teto: 3ª chamada denied' 'f' \
  "SELECT allowed FROM public.consume_login_gate('emteto@x.com','10.0.0.2',10,60,2,60)"
expect_value 'B.20 contador de e-mail ficou em 3 hits' '3' \
  "SELECT hits FROM public.edge_rate_limits WHERE key='auth-login-email:emteto@x.com'"

row="$(as_role service_role "SELECT allowed||'|'||is_locked||'|'||attempts FROM public.consume_login_gate(NULL,'10.0.0.3',10,60,20,60)" | tail -n1)"
[[ "$row" == "true|false|0" ]] || fail "B.21 corpo inválido (p_email NULL) deveria responder t|f|0, obtido '$row'"
printf '[PASS] %s\n' 'B.21 p_email NULL (corpo inválido) responde allowed sem tocar e-mail'
expect_value 'B.22 p_email NULL consumiu o IP' '1' \
  "SELECT hits FROM public.edge_rate_limits WHERE key='auth-login:10.0.0.3'"
expect_value 'B.23 p_email NULL não criou contador de e-mail' '0' \
  "SELECT count(*) FROM public.edge_rate_limits WHERE key LIKE 'auth-login-email:%' AND updated_at > now() - interval '1 minute' AND key NOT IN ('auth-login-email:ipok@x.com','auth-login-email:emteto@x.com','auth-login-email:travada@x.com')"

# Atomicidade: as duas escritas da RPC morrem com a transação do chamador.
set +e
psql_sql "BEGIN; SELECT allowed FROM public.consume_login_gate('atom@x.com','10.0.0.9',10,60,20,60); SELECT 1/0; COMMIT;" >/dev/null 2>&1
set -e
expect_value 'B.24 erro após a chamada desfaz as DUAS escritas (IP)' '0' \
  "SELECT count(*) FROM public.edge_rate_limits WHERE key='auth-login:10.0.0.9'"
expect_value 'B.25 erro após a chamada desfaz as DUAS escritas (e-mail)' '0' \
  "SELECT count(*) FROM public.edge_rate_limits WHERE key='auth-login-email:atom@x.com'"

expect_error 'B.26 p_ip vazio levanta exceção' 'p_ip obrigatorio' \
  "SELECT * FROM public.consume_login_gate('a@b.com','',10,60,20,60)"
expect_error 'B.27 p_ip_max < 1 levanta exceção' 'p_ip_max invalido' \
  "SELECT * FROM public.consume_login_gate('a@b.com','10.1.1.1',0,60,20,60)"

printf '\n============ BLOCO C — p95: chamada única vs sequência antiga ============\n'
# Mesma sessão psql (stdin), \timing por statement: mede execução + round-trip
# por chamada, como a edge vê. ANTIGA = 3 statements por tentativa; NOVA = 1.
{
  printf '\\timing on\n'
  for _ in $(seq 1 "$bench_n"); do
    cat <<'SQL'
SELECT allowed FROM public.consume_rate_limit('auth-login:10.9.9.9', 10, 60);
SELECT allowed FROM public.consume_rate_limit('auth-login-email:bench@x.com', 20, 60);
SELECT is_locked FROM public.is_account_locked('bench@x.com');
SQL
  done
} > "$tmp_dir/bench_old.sql"
{
  printf '\\timing on\n'
  for _ in $(seq 1 "$bench_n"); do
    echo "SELECT allowed FROM public.consume_login_gate('bench@x.com','10.9.9.8',10,60,20,60);"
  done
} > "$tmp_dir/bench_new.sql"

docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < "$tmp_dir/bench_old.sql" > "$tmp_dir/bench_old.out" 2>&1
docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < "$tmp_dir/bench_new.sql" > "$tmp_dir/bench_new.out" 2>&1

old_p95="$(grep -c '^Time:' "$tmp_dir/bench_old.out" >/dev/null \
  && grep '^Time:' "$tmp_dir/bench_old.out" | awk '{s+=$2; n++} n%3==0{print s; s=0}' \
     | sort -n | awk '{a[NR]=$1} END{print a[int(0.95*NR + 0.999999)]}')"
new_p95="$(grep '^Time:' "$tmp_dir/bench_new.out" | awk '{print $2}' \
  | sort -n | awk '{a[NR]=$1} END{print a[int(0.95*NR + 0.999999)]}')"
old_count="$(grep -c '^Time:' "$tmp_dir/bench_old.out" || true)"
new_count="$(grep -c '^Time:' "$tmp_dir/bench_new.out" || true)"
[[ "$old_count" -eq $((bench_n * 3)) ]] || fail "benchmark antigo incompleto: $old_count statements (esperava $((bench_n * 3)))"
[[ "$new_count" -eq "$bench_n" ]] || fail "benchmark novo incompleto: $new_count statements (esperava $bench_n)"
printf 'p95_antigo=%sms (sequência de 3 chamadas, n=%s)\n' "$old_p95" "$bench_n"
printf 'p95_novo=%sms (chamada única, n=%s)\n' "$new_p95" "$bench_n"
awk -v novo="$new_p95" -v antigo="$old_p95" 'BEGIN{exit !(novo < antigo)}' \
  || fail "p95_novo ($new_p95) não é menor que p95_antigo ($old_p95)"
printf '[PASS] %s\n' "C.1 p95_novo < p95_antigo (${new_p95}ms < ${old_p95}ms)"

echo ""
echo "OK — consume_login_gate: bloqueio antes dos contadores, tetos, atomicidade, grants e p95 verificados."
