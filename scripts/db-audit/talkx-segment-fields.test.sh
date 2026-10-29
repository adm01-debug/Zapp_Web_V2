#!/usr/bin/env bash
# N-111: contrato de banco da tabela oficial de campos/operadores de segmento
# do Talk X (talkx_segment_fields) e da funcao de compilacao
# (talkx_compile_segment_rules).
#
# PAPEL: este script DEVE ser executado com o papel `authenticated` (nao
# service_role). A funcao e o caminho do usuario comum: compila regras em SQL
# sem privilégio de service_role. Todas as chamadas a funcao aqui usam
# `SET ROLE authenticated` antes de executar; nenhum teste depende de
# service_role (a role so existe para as policies da tabela).
#
# Roda contra um PostgreSQL 17 descartavel (docker), no mesmo formato dos
# testes irmaos (scripts/db-audit/talkx-audience-rpc.test.sh). Aplica a
# MIGRATION REAL do repo DUAS vezes (idempotencia), com psql -v ON_ERROR_STOP=1
# e sem mascarar falha (sem `|| true` na aplicacao). Prova, com SQL executado:
#   (a) a migration aplica e e idempotente (2a aplicacao verde na mesma base);
#   (b) tabela existe com as colunas corretas e 18 linhas enabled=true;
#   (c) RLS habilitado; policy SELECT para authenticated; policy ALL para
#       service_role; authenticated sem escrita; authenticated com SELECT;
#   (d) authenticated pode EXECUTAR a funcao (sem service_role);
#   (e) valor malicioso "30) OR 1=1 --" em in_last_days E em not_in_last_days e
#       RECUSADO com 22023 antes de compor SQL (item 1 do criterio);
#   (f) valor valido (30 dias) compila predicado correto e, executado contra
#       contatos reais, seleciona so o contato de 10 dias (dentro de 30) e nao
#       o de 40 dias (item 2 do criterio);
#   (g) not_in_last_days com 30 dias seleciona so o contato de 40 dias;
#   (h) campo invalido e operador invalido para o campo -> 22023;
#   (i) valor nao numerico em campo number -> 22023;
#   (j) valor com aspa simples e escapado por quote_literal (sem injecao).

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20261011003001_talkx_segment_fields.sql"
postgres_image="${TALKX_SEGMENT_FIELDS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-segment-fields-test-$$"
test_password="talkx_segment_fields_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

# Predicado compilado, executando a funcao como `authenticated`.
compile_auth() { printf '%s\n' "SET ROLE authenticated; SELECT public.talkx_compile_segment_rules(:'json'::jsonb);" | docker exec -i "$container_name" psql -X -U postgres -d postgres -v json="$1" -Atq; }

# Consulta SQL qualquer como `authenticated` (a funcao e a leitura de contacts
# nao exigem service_role).
query_auth() { printf '%s\n' "SET ROLE authenticated; $1" | docker exec -i "$container_name" psql -X -U postgres -d postgres -Atq; }

# Espera 22023 com a mensagem certa, executando a funcao como `authenticated`.
expect_error() {
  local label="$1" message="$2" errcode="$3" json="$4" out status
  set +e
  out="$(printf '%s\n' "SET ROLE authenticated; SELECT public.talkx_compile_segment_rules(:'json'::jsonb);" | \
        docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -U postgres -d postgres -v json="$json" -Atq 2>&1)"
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
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# Roles que a migration espera. DO block idempotente: sem `|| true` mascarando
# falha e reaplicavel na mesma base.
psql_test -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$$;
SQL

# Aplica a migration real DUAS vezes. Operador que falha de verdade: se o psql
# sair != 0, a pipeline sob pipefail derruba o script (sem mascarar).
apply_migration() {
  cat "$migration" | psql_test -v ON_ERROR_STOP=1 || fail "Falha ao aplicar a migration real ($1)"
}
apply_migration '1a aplicacao'
apply_migration '2a aplicacao (idempotencia)'
pass 'migration aplicada e idempotente (2a aplicacao verde na mesma base)'

# (b) Tabela existe com as colunas corretas e 18 linhas enabled.
psql_test -Atqc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='talkx_segment_fields'" | grep -q 1 || fail 'tabela talkx_segment_fields nao existe'
for col in field category source expr kind ops enabled; do
  psql_test -Atqc "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_segment_fields' AND column_name='$col'" | grep -q 1 || fail "coluna $col nao existe"
done
row_count=$(psql_test -Atqc "SELECT count(*) FROM public.talkx_segment_fields")
(( row_count == 18 )) || fail "esperado 18 linhas seedadas, encontrou $row_count"
enabled_count=$(psql_test -Atqc "SELECT count(*) FROM public.talkx_segment_fields WHERE enabled=true")
(( enabled_count == 18 )) || fail "esperado 18 linhas enabled, encontrou $enabled_count"
pass 'tabela existe com as colunas corretas e 18 linhas enabled=true'

# (c) RLS, policies e grants.
[[ "$(psql_test -Atqc "SELECT relrowsecurity FROM pg_class WHERE relname='talkx_segment_fields'")" == t ]] || fail 'RLS nao habilitado'
[[ "$(psql_test -Atqc "SELECT polpermissive FROM pg_policy WHERE polname='talkx_segment_fields_select' AND polcmd='r'")" == t ]] || fail 'policy SELECT ausente'
[[ "$(psql_test -Atqc "SELECT polpermissive FROM pg_policy WHERE polname='talkx_segment_fields_service_role_write' AND polcmd='*'")" == t ]] || fail 'policy ALL ausente'
for role in anon authenticated; do
  [[ "$(psql_test -Atqc "SELECT has_table_privilege('$role','public.talkx_segment_fields','INSERT')")" == f ]] || fail "role $role nao deveria ter escrita"
done
[[ "$(psql_test -Atqc "SELECT has_table_privilege('authenticated','public.talkx_segment_fields','SELECT')")" == t ]] || fail 'authenticated deveria ter SELECT'
pass 'RLS/policies/grants da tabela corretos'

# (d) authenticated executa a funcao (sem service_role).
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.talkx_compile_segment_rules(jsonb,integer)','EXECUTE')")" == t ]] || fail 'authenticated deveria poder EXECUTAR a funcao'
pass 'authenticated pode EXECUTAR talkx_compile_segment_rules'

# Contatos de fixture para provar que o predicado compilado seleciona de verdade.
psql_test -v ON_ERROR_STOP=1 -c "
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  email text, tags text[], company text, city text, state text,
  group_category text, channel_type text, lead_origin text, assigned_to uuid,
  contact_type text, conversation_status text, lead_score numeric,
  risk_score numeric, ai_priority text, ai_sentiment text, consent_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.contacts (id, email, created_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'dentro@example.com', now() - interval '10 days'),
  ('00000000-0000-0000-0000-000000000002', 'fora@example.com',   now() - interval '40 days');
GRANT SELECT ON public.contacts TO authenticated;
" >/dev/null

# (e) ITEM 1: valor malicioso recusado com 22023 nos DOIS ramos de data.
inject='{"groups":[{"match":"and","rules":[{"field":"created_at","op":"in_last_days","value":"30) OR 1=1 --"}]}]}'
expect_error 'in_last_days recusa "30) OR 1=1 --" com 22023' 'invalid_talkx_segment_rule_value' '22023' "$inject"
inject_neg='{"groups":[{"match":"and","rules":[{"field":"updated_at","op":"not_in_last_days","value":"30) OR 1=1 --"}]}]}'
expect_error 'not_in_last_days recusa "30) OR 1=1 --" com 22023' 'invalid_talkx_segment_rule_value' '22023' "$inject_neg"

# (f) ITEM 2: valor valido (30 dias) compila predicado correto e seleciona so o contato dentro da janela.
in30='{"groups":[{"match":"and","rules":[{"field":"created_at","op":"in_last_days","value":"30"}]}]}'
pred_in30="$(compile_auth "$in30")"
[[ -n "$pred_in30" ]] || fail 'predicado de in_last_days 30 nao deveria ser vazio'
[[ "$pred_in30" == *"c.created_at"* ]] || fail "predicado deveria citar c.created_at, veio: $pred_in30"
[[ "$pred_in30" == *">="* && "$pred_in30" == *"::timestamptz"* ]] || fail "predicado deveria ser >= ...::timestamptz, veio: $pred_in30"
count_in30="$(query_auth "SELECT count(*) FROM public.contacts c WHERE $pred_in30")"
(( count_in30 == 1 )) || fail "in_last_days 30 deveria achar 1 contato, achou $count_in30"
pass 'in_last_days 30 compila predicado correto e seleciona so o contato de 10 dias'

# (g) not_in_last_days 30 seleciona so o contato de 40 dias.
not30='{"groups":[{"match":"and","rules":[{"field":"created_at","op":"not_in_last_days","value":"30"}]}]}'
pred_not30="$(compile_auth "$not30")"
[[ "$pred_not30" == *"<"* && "$pred_not30" == *"::timestamptz"* ]] || fail "predicado deveria ser < ...::timestamptz, veio: $pred_not30"
count_not30="$(query_auth "SELECT count(*) FROM public.contacts c WHERE $pred_not30")"
(( count_not30 == 1 )) || fail "not_in_last_days 30 deveria achar 1 contato, achou $count_not30"
pass 'not_in_last_days 30 seleciona so o contato de 40 dias'

# (h) campo invalido e operador invalido para o campo -> 22023.
bad_field='{"groups":[{"match":"and","rules":[{"field":"campo_inexistente","op":"eq","value":"x"}]}]}'
expect_error 'campo invalido gera 22023' 'invalid_talkx_segment_field' '22023' "$bad_field"
bad_op='{"groups":[{"match":"and","rules":[{"field":"tags","op":"eq","value":"x"}]}]}'
expect_error 'operador invalido para o campo gera 22023' 'invalid_talkx_segment_operator' '22023' "$bad_op"

# (i) valor nao numerico em campo number -> 22023 (contrato do valor).
bad_num='{"groups":[{"match":"and","rules":[{"field":"lead_score","op":"gt","value":"abc"}]}]}'
expect_error 'valor nao numerico em number gera 22023' 'invalid_talkx_segment_rule_value' '22023' "$bad_num"

# (j) aspa simples no valor e escapada por quote_literal (sem injecao).
esc="{\"groups\":[{\"match\":\"and\",\"rules\":[{\"field\":\"email\",\"op\":\"eq\",\"value\":\"a' OR 1=1 --\"}]}]}"
pred_esc="$(compile_auth "$esc")"
[[ "$pred_esc" == *"'a'' OR 1=1 --'"* ]] || fail "o valor deveria sair escapado por quote_literal, veio: $pred_esc"
pass 'valor com aspa simples sai escapado por quote_literal'

printf '\n=== TODOS OS TESTES PASSARAM ===\n'
