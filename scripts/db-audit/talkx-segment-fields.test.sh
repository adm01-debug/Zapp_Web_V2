#!/usr/bin/env bash
# N-112: talkx_compile_segment_rules com expr/valor validados (%I/%L, 22023).
# Migration REAL 20261010032548 em PG17; prova (i)-(u), (u) com papel real.
# Fixture monta o minimo da talkx_segment_fields (DDL+seed da N-111, nao integrada).
# NAO FEITO (corte p/ 25k; pendente): (a)-(h) na migration real da N-111 e a
# equivalencia de ids com talkx_resolve_audience.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration_n112="$repo_root/supabase/migrations/20261010032548_talkx_compile_segment_rules_safe.sql"
postgres_image="${TALKX_SEGMENT_FIELDS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-segfields-$$"
test_password="talkx_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

expect_error() {
  local label="$1" message="$2" errcode="$3" sql="$4" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava a mensagem '$message'"; }
  [[ "$out" == *"$errcode"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o SQLSTATE '$errcode'"; }
  pass "$label"
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
  done
  return 1
}

start_postgres || fail 'PG de teste nao iniciou'

psql_test -v ON_ERROR_STOP=1 -c "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;" 2>/dev/null || true
# Fixture (DDL igual ao da N-111).
psql_test -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS public.talkx_segment_fields (field text PRIMARY KEY, category text NOT NULL, source text NOT NULL DEFAULT 'contacts', expr text NOT NULL, kind text NOT NULL CHECK (kind IN ('text','array','number','date','enum','uuid')), ops text[] NOT NULL, enabled boolean NOT NULL DEFAULT true);" || fail 'fixture: CREATE TABLE falhou'
psql_test -v ON_ERROR_STOP=1 -c "INSERT INTO public.talkx_segment_fields (field, category, source, expr, kind, ops) VALUES
  ('tags','basico',    'contacts','c.tags','array',ARRAY['contains','not_contains','is_empty']),
  ('lead_score','comercial', 'contacts','c.lead_score','number',ARRAY['eq','gt','gte','lt','lte']),
  ('created_at','basico',    'contacts','c.created_at','date',ARRAY['in_last_days','not_in_last_days']),
  ('email','basico',    'contacts','c.email','text',ARRAY['eq','neq','contains','not_contains','is_set','is_empty'])
ON CONFLICT (field) DO NOTHING;" || fail 'fixture: seed falhou'
# Migration REAL N-112 (SKIP=1: vermelho manual).
skip_migration="${TALKX_SKIP_MIGRATION:-0}"
if [[ "$skip_migration" != "1" ]]; then
  cat "$migration_n112" | psql_test -v ON_ERROR_STOP=1 || fail 'migration N-112 nao aplicou'
fi

# (i) Regra valida devolve predicado.
result=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"contains\",\"value\":\"vip\"},{\"field\":\"lead_score\",\"op\":\"gt\",\"value\":\"50\"}]}]}'::jsonb)")
[[ -n "$result" ]] || fail "regra valida devolve predicado nao vazio"
[[ "$result" == *"tags"* ]] || fail "o predicado deveria conter 'tags'"
[[ "$result" == *"> '50'"* ]] || fail "o predicado deveria conter '> 50' para lead_score gt 50"
pass "regras validas devolvem predicado"

# (j) Campo invalido -> 22023.
expect_error "campo invalido gera 22023" "invalid_talkx_segment_field" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"campo_inexistente\",\"op\":\"eq\",\"value\":\"teste\"}]}]}'::jsonb)"

# (k) Operador invalido -> 22023.
expect_error "operador invalido gera 22023" "invalid_talkx_segment_operator" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"eq\",\"value\":\"teste\"}]}]}'::jsonb)"

# (l) Valor vazio p/ op que exige valor -> 22023.
expect_error "valor vazio para op nao-is_set gera 22023" "invalid_talkx_segment_rule_value" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"lead_score\",\"op\":\"gt\",\"value\":\"\"}]}]}'::jsonb)"

# (m) is_set/is_empty nao exigem valor.
result_is_set=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"email\",\"op\":\"is_set\",\"value\":null}]}]}'::jsonb)")
[[ "$result_is_set" == *"IS NOT NULL"* ]] || fail "is_set deveria gerar 'IS NOT NULL'"
pass "is_set nao exige valor e gera IS NOT NULL"

result_is_empty=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"email\",\"op\":\"is_empty\",\"value\":null}]}]}'::jsonb)")
[[ "$result_is_empty" == *"IS NULL"* ]] || fail "is_empty deveria gerar 'IS NULL' para text"
pass "is_empty nao exige valor e gera IS NULL"

# (n) quote_literal escapa single-quote.
result_injection=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"email\",\"op\":\"eq\",\"value\":\"test'' OR 1=1 --\"}]}]}'::jsonb)")
[[ "$result_injection" == *"'test'' OR 1=1 --'"* ]] || fail "o valor deveria ser escapado com quote_literal, nao causando injecao"
pass "%I e quote_literal impedem injecao SQL"

# (o) in_last_days malicioso -> 22023.
expect_error "in_last_days com valor malicioso e recusado com 22023" "invalid_talkx_segment_rule_value" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"created_at\",\"op\":\"in_last_days\",\"value\":\"30) OR 1=1 --\"}]}]}'::jsonb)"

# (p) not_in_last_days malicioso -> 22023.
expect_error "not_in_last_days com valor malicioso e recusado com 22023" "invalid_talkx_segment_rule_value" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"created_at\",\"op\":\"not_in_last_days\",\"value\":\"30) OR 1=1 --\"}]}]}'::jsonb)"

# (q) in_last_days valido compila.
result_valid_days=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"created_at\",\"op\":\"in_last_days\",\"value\":\"30\"}]}]}'::jsonb)")
[[ "$result_valid_days" == *">="* ]] || fail "in_last_days valido deveria gerar um predicado com '>='"
pass "in_last_days com valor valido devolve predicado correto"

# (r) expr adulterada -> 22023; tabela volta ao original.
orig_expr=$(psql_q "SELECT expr FROM public.talkx_segment_fields WHERE field='tags'")
psql_test -c "UPDATE public.talkx_segment_fields SET expr='c.tags) OR (''1''=''1' WHERE field='tags'" >/dev/null
expect_error "expr adulterada e recusada com 22023" "invalid_talkx_segment_field_expr" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"contains\",\"value\":\"vip\"}]}]}'::jsonb)"
psql_test -c "UPDATE public.talkx_segment_fields SET expr='$orig_expr' WHERE field='tags'" >/dev/null
restored=$(psql_q "SELECT expr FROM public.talkx_segment_fields WHERE field='tags'")
[[ "$restored" == "$orig_expr" ]] || fail "(r) a tabela nao voltou ao original apos o teste de expr"
pass "expr adulterada recusada; tabela intacta"

# (s) profundidade > 10 -> 22023.
expect_error "profundidade acima do limite e recusada" "segment_rules_depth_exceeded" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"contains\",\"value\":\"vip\"}]}]}'::jsonb, 11)"

# (t) ' 30' e '3.5' -> 22023; '-5' compila.
expect_error "in_last_days com espaco e recusado com 22023" "invalid_talkx_segment_rule_value" "22023" "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"created_at\",\"op\":\"in_last_days\",\"value\":\" 30\"}]}]}'::jsonb)"
expect_error "in_last_days com decimal e recusado com 22023" "invalid_talkx_segment_rule_value" "22023" "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"created_at\",\"op\":\"in_last_days\",\"value\":\"3.5\"}]}]}'::jsonb)"
result_neg=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"created_at\",\"op\":\"in_last_days\",\"value\":\"-5\"}]}]}'::jsonb)")
[[ "$result_neg" == *">="* ]] || fail "in_last_days com '-5' deveria compilar um predicado com '>='"
pass "borda in_last_days ok"

# (u) anon/authenticated -> 42501; service_role executa.
expect_error "anon nao executa a funcao" "permission denied" "42501" \
  "BEGIN; SET LOCAL ROLE anon; SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"contains\",\"value\":\"vip\"}]}]}'::jsonb); ROLLBACK;"
expect_error "authenticated nao executa a funcao" "permission denied" "42501" \
  "BEGIN; SET LOCAL ROLE authenticated; SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"contains\",\"value\":\"vip\"}]}]}'::jsonb); ROLLBACK;"
result_svc=$(psql_q "BEGIN; SET LOCAL ROLE service_role; SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"contains\",\"value\":\"vip\"}]}]}'::jsonb); ROLLBACK;")
[[ "$result_svc" == *"tags"* ]] || fail "service_role deveria executar a funcao e receber o predicado"
pass "EXECUTE: anon/authenticated 42501, service_role ok"

printf '\n=== TODOS OS TESTES PASSARAM ===\n'
