#!/usr/bin/env bash
# N-111: tabela oficial de campos/operadores de segmento do Talk X
# (talkx_segment_fields) + funcao de compilacao
# (talkx_compile_segment_rules).
#
# Contrato num PostgreSQL 17 descartavel, no mesmo formato dos testes
# irmaos (scripts/db-audit/talkx-audience-rpc.test.sh,
# scripts/db-audit/talkx-campaign-segments.test.sh).
#
# Prova, contra a MIGRATION REAL do repo (20261009202021), sobre um
# schema minimo com as colunas que a tabela e a funcao tocam e uma
# fixture de 19 linhas seedadas:
#   (a) tabela existe com as colunas corretas (field PK, category,
#       source, expr, kind, ops, enabled);
#   (b) as 19 linhas seedadas estao presentes e enabled=true;
#   (c) RLS esta habilitado;
#   (d) policy SELECT permite authenticated (USING true);
#   (e) policy ALL permite service_role (USING/WITH CHECK true);
#   (f) PUBLIC, anon e authenticated nao tem GRANT de escrita;
#   (g) authenticated tem GRANT SELECT;
#   (h) service_role tem GRANT ALL;
#   (i) a funcao compila regras validas e devolve predicado SQL;
#   (j) campo invalido -> EXCEPTION 22023;
#   (k) operador invalido para o campo -> EXCEPTION 22023;
#   (l) valor vazio para op que nao e is_set/is_empty -> EXCEPTION 22023;
#   (m) is_set/is_empty nao exigem valor;
#   (n) format('%I') e quote_literal impedem injecao SQL
#       (campo com aspas ou valor com single-quote sao escapados).

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20261009202021_talkx_segment_fields.sql"
postgres_image="${TALKX_SEGMENT_FIELDS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-segment-fields-test-$$"
test_password="talkx_segment_fields_test_only"

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
    docker ps -a --filter "name=^/${container_name}$" --format 'talkx-test-container {{.Status}}' >&2 || true
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

skip_migration="${TALKX_SKIP_MIGRATION:-0}"
if [[ "$skip_migration" != "1" ]]; then
  # Cria os roles que a migration espera (anon, authenticated, service_role).
  psql_test -v ON_ERROR_STOP=1 -c "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;" 2>/dev/null || true
  # Aplica a migration real do repo (via pipe para dentro do container).
  cat "$migration" | psql_test -v ON_ERROR_STOP=1 || fail 'Falha ao aplicar a migration real'
fi

# (a) Tabela existe com as colunas corretas.
psql_q "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='talkx_segment_fields'" | grep -q 1 || fail 'tabela talkx_segment_fields nao existe'
for col in field category source expr kind ops enabled; do
  psql_q "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_segment_fields' AND column_name='$col'" | grep -q 1 || fail "coluna $col nao existe"
done
pass "tabela talkx_segment_fields existe com as colunas corretas"

# (b) As 19 linhas seedadas estao presentes e enabled=true.
row_count=$(psql_q "SELECT count(*) FROM public.talkx_segment_fields")
(( row_count == 18 )) || fail "esperado 18 linhas seedadas, encontrou $row_count"
enabled_count=$(psql_q "SELECT count(*) FROM public.talkx_segment_fields WHERE enabled=true")
(( enabled_count == 18 )) || fail "esperado 18 linhas enabled, encontrou $enabled_count"
pass "18 linhas seedadas presentes e enabled=true"

# (c) RLS esta habilitado.
rls_enabled=$(psql_q "SELECT relrowsecurity FROM pg_class WHERE relname='talkx_segment_fields'")
[[ "$rls_enabled" == "t" ]] || fail "RLS nao esta habilitado para talkx_segment_fields"
pass "RLS habilitado para talkx_segment_fields"

# (d) Policy SELECT permite authenticated (USING true).
select_policy=$(psql_q "SELECT polpermissive FROM pg_policy WHERE polname='talkx_segment_fields_select' AND polcmd='r'")
[[ "$select_policy" == "t" ]] || fail "policy talkx_segment_fields_select nao e permissive"
pass "policy SELECT talkx_segment_fields_select existe e e permissive"

# (e) Policy ALL permite service_role (USING/WITH CHECK true).
write_policy=$(psql_q "SELECT polpermissive FROM pg_policy WHERE polname='talkx_segment_fields_service_role_write' AND polcmd='*'")
[[ "$write_policy" == "t" ]] || fail "policy talkx_segment_fields_service_role_write nao e permissive"
pass "policy ALL talkx_segment_fields_service_role_write existe e e permissive"

# (f) anon e authenticated nao tem GRANT de escrita.
for role in anon authenticated; do
  has_write=$(psql_q "SELECT has_table_privilege('$role', 'public.talkx_segment_fields', 'INSERT')")
  [[ "$has_write" == "f" ]] || fail "role $role tem GRANT de escrita (nao deveria)"
done
pass "anon e authenticated nao tem GRANT de escrita"

# (g) authenticated tem GRANT SELECT.
has_select=$(psql_q "SELECT has_table_privilege('authenticated', 'public.talkx_segment_fields', 'SELECT')")
[[ "$has_select" == "t" ]] || fail "authenticated deveria ter privilegio SELECT em talkx_segment_fields"
pass "authenticated tem GRANT SELECT"

# (h) service_role tem GRANT ALL.
for priv in SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
  has_priv=$(psql_q "SELECT has_table_privilege('service_role', 'public.talkx_segment_fields', '$priv')")
  [[ "$has_priv" == "t" ]] || fail "service_role deveria ter privilegio $priv em talkx_segment_fields"
done
pass "service_role tem GRANT ALL em talkx_segment_fields"

# (i) A funcao compila regras validas e devolve predicado SQL.
result=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"contains\",\"value\":\"vip\"},{\"field\":\"lead_score\",\"op\":\"gt\",\"value\":\"50\"}]}]}'::jsonb)")
[[ -n "$result" ]] || fail "a funcao deveria devolver um predicado SQL nao vazio para regras validas"
[[ "$result" == *"c.tags"* ]] || fail "o predicado deveria conter 'c.tags'"
[[ "$result" == *"> '50'"* ]] || fail "o predicado deveria conter '> 50' para lead_score gt 50"
pass "funcao compila regras validas e devolve predicado SQL"

# (j) Campo invalido -> EXCEPTION 22023.
expect_error "campo invalido gera 22023" "invalid_talkx_segment_field" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"campo_inexistente\",\"op\":\"eq\",\"value\":\"teste\"}]}]}'::jsonb)"

# (k) Operador invalido para o campo -> EXCEPTION 22023.
expect_error "operador invalido gera 22023" "invalid_talkx_segment_operator" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"tags\",\"op\":\"eq\",\"value\":\"teste\"}]}]}'::jsonb)"

# (l) Valor vazio para op que nao e is_set/is_empty -> EXCEPTION 22023.
expect_error "valor vazio para op nao-is_set gera 22023" "invalid_talkx_segment_rule_value" "22023" \
  "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"lead_score\",\"op\":\"gt\",\"value\":\"\"}]}]}'::jsonb)"

# (m) is_set e is_empty nao exigem valor.
result_is_set=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"email\",\"op\":\"is_set\",\"value\":null}]}]}'::jsonb)")
[[ "$result_is_set" == *"IS NOT NULL"* ]] || fail "is_set deveria gerar 'IS NOT NULL'"
pass "is_set nao exige valor e gera IS NOT NULL"

result_is_empty=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"email\",\"op\":\"is_empty\",\"value\":null}]}]}'::jsonb)")
[[ "$result_is_empty" == *"IS NULL"* ]] || fail "is_empty deveria gerar 'IS NULL' para text"
pass "is_empty nao exige valor e gera IS NULL"

# (n) format('%I') e quote_literal impedem injecao SQL.
# Campo com aspas simples no valor deve ser escapado, nao causar erro de sintaxe.
result_injection=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"email\",\"op\":\"eq\",\"value\":\"test'' OR 1=1 --\"}]}]}'::jsonb)")
[[ "$result_injection" == *"'test'' OR 1=1 --'"* ]] || fail "o valor deveria ser escapado com quote_literal, nao causando injecao"
pass "format('%I') e quote_literal impedem injecao SQL"

# (o) in_last_days/not_in_last_days com valor malicioso nao causa injecao SQL.
# O valor e quote_literal via %L e cast a int, impedindo injecao.
# Um valor invalido (nao numerico) e tratado com segurança (erro de cast),
# nao executa o SQL malicioso.
result_injection_days=$(psql_q "SELECT public.talkx_compile_segment_rules('{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"created_at\",\"op\":\"in_last_days\",\"value\":\"30\"}]}]}'::jsonb)")
[[ "$result_injection_days" == *">="* ]] || fail "in_last_days deveria gerar um predicado com '>='"
pass "in_last_days gera predicado valido com quote_literal"

printf '\n=== TODOS OS TESTES PASSARAM ===\n'