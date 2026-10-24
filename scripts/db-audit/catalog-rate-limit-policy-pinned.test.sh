#!/usr/bin/env bash
# R2-DB-010 (item 296, P2) — "Usuario pode zerar o contador de requisicoes do catalogo pela RPC
# publica autenticada" (docs/reconciliation/reaudit/2026-10-03/reports/database/report.md).
#
# Roda em PostgreSQL 17 descartavel, aplicando as MIGRATIONS REAIS do repositorio e executando
# como o PAPEL REAL (`authenticated`, com request.jwt.claims), nunca como postgres:
#
#   BLOCO A — estado ANTERIOR (defeito), so com as migrations 20261002681230 e 20261003122707:
#             * a cota e consumida normalmente (60/min em bootstrap);
#             * o ataque `p_window_ms = 0` apaga TODOS os hits da propria chave (inclusive o hit
#               recem-inserido) -> devolve true e a chamada seguinte volta a ser liberada;
#             * janela negativa faz o mesmo; `p_limit` arbitrario tambem libera.
#
#   BLOCO B — migration nova aplicada (20261007000311):
#             * a cota e a janela vem de politica confiavel compilada na funcao;
#             * os MESMOS ataques (janela 0/negativa/1 ms/enorme, limite arbitrario) nao apagam
#               historico e seguem negando (false);
#             * o caminho normal (edge) nao muda: 60/min em bootstrap e 120/min em list_products,
#               mesmo com a edge enviando os argumentos de sempre;
#             * acao inventada cai no balde 'global' (sem balde novo e ilimitado);
#             * isolamento por usuario e por acao preservado; anon segue sem EXECUTE;
#               authenticated mantem EXECUTE (a edge chama com o JWT do usuario).
#
#   BLOCO C — o bloco BEGIN-ROLLBACK da propria migration e EXTRAIDO do arquivo e EXECUTADO:
#             o corpo anterior da funcao volta (o argumento manda de novo, inclusive o expurgo
#             com janela 0) e reaplicar a migration e idempotente.
#
# Para provar o VERMELHO (o teste falha sem a correcao):
#   CATALOG_RATE_LIMIT_SEM_FIX=1 scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mig_shared="$repo_root/supabase/migrations/20261002681230_catalogo_rate_limit_compartilhado.sql"
mig_append="$repo_root/supabase/migrations/20261003122707_catalogo_rate_limit_hits_append_only.sql"
mig_fix="$repo_root/supabase/migrations/20261007000311_catalogo_rate_limit_politica_confiavel.sql"
postgres_image="${CATALOG_RATE_LIMIT_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-catalog-rate-limit-test-$$"
sem_fix="${CATALOG_RATE_LIMIT_SEM_FIX:-0}"
tmp_base="${TMPDIR:-/tmp}"
tmp_dir="$(mktemp -d "$tmp_base/zapp-v2-catalog-rate-limit-test.XXXXXX")"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-catalog-rate-limit-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    "$tmp_base"/zapp-v2-catalog-rate-limit-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_count() {  # comparacao de valor ja obtido (nao re-executa SQL)
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  expect_count "$1" "$2" "$(psql_sql "$3" | tail -n1)"
}
expect_value_as() {
  expect_count "$1" "$2" "$(as_user "$3" "$4" | tail -n1)"
}
expect_error_as() {
  local label="$1" needle="$2" jwt="$3" sql="$4" out st
  set +e; out="$(as_user "$jwt" "$sql" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
hits_of() {  # hits na chave (user, action) — lido como postgres, so para a prova
  psql_sql "SELECT count(*) FROM public.catalog_rate_limit_hits WHERE user_id='$1' AND action='$2';" | tail -n1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for m in "$mig_shared" "$mig_append" "$mig_fix"; do
  [[ -f "$m" ]] || fail "migration nao encontrada: $m"
done

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
-- Default privileges do Supabase: funcao nova nasce executavel por anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# --- estado ANTERIOR fiel: as duas migrations REAIS do limitador (compartilhado + append-only).
psql_file "$mig_shared" >/dev/null
psql_file "$mig_append" >/dev/null

U1='11111111-1111-1111-1111-111111111111'
U3='33333333-3333-3333-3333-333333333333'
U5='55555555-5555-5555-5555-555555555555'
U7='77777777-7777-7777-7777-777777777777'
U9='99999999-9999-9999-9999-999999999999'
U11='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
J1="{\"sub\":\"$U1\",\"role\":\"authenticated\"}"
J3="{\"sub\":\"$U3\",\"role\":\"authenticated\"}"
J5="{\"sub\":\"$U5\",\"role\":\"authenticated\"}"
J7="{\"sub\":\"$U7\",\"role\":\"authenticated\"}"
J9="{\"sub\":\"$U9\",\"role\":\"authenticated\"}"
J11="{\"sub\":\"$U11\",\"role\":\"authenticated\"}"

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_value_as 'A.1 usuario consome a cota de bootstrap (60 passam com a rajada)' '60' "$J1" \
  "SELECT count(*) FROM generate_series(1,60) g WHERE public.catalog_rate_limit_hit('$U1','bootstrap',60,60000);"
expect_value_as 'A.2 a 61a chamada e negada (limite funcionando)' 'f' "$J1" \
  "SELECT public.catalog_rate_limit_hit('$U1','bootstrap',60,60000);"
expect_count 'A.3 o balde tem os 61 hits' '61' "$(hits_of "$U1" bootstrap)"

expect_value_as 'A.4 (DEFEITO) ataque com p_window_ms=0 devolve true: apagou a propria chave' 't' "$J1" \
  "SELECT public.catalog_rate_limit_hit('$U1','bootstrap',60,0);"
expect_count 'A.5 (DEFEITO) os 61 hits foram APAGADOS pelo ataque' '0' "$(hits_of "$U1" bootstrap)"
expect_value_as 'A.6 (DEFEITO) a chamada seguinte do endpoint volta liberada (cota reiniciada)' 't' "$J1" \
  "SELECT public.catalog_rate_limit_hit('$U1','bootstrap',60,60000);"

expect_value_as 'A.7 (DEFEITO) janela NEGATIVA (-5000 ms) tambem zera a chave' 't' "$J1" \
  "SELECT public.catalog_rate_limit_hit('$U1','bootstrap',60,-5000);"
expect_count 'A.8 (DEFEITO) o balde voltou a ficar vazio' '0' "$(hits_of "$U1" bootstrap)"

expect_value_as 'A.9 (DEFEITO) limite arbitrario (p_limit=999999) libera mesmo com a chave esvaziada' 't' "$J1" \
  "SELECT public.catalog_rate_limit_hit('$U1','bootstrap',999999,60000);"

printf '\n============ BLOCO B — migration 20261007000311 aplicada ============\n'
if [[ "$sem_fix" == "1" ]]; then
  printf '[AVISO] CATALOG_RATE_LIMIT_SEM_FIX=1: a correcao NAO foi aplicada (roda vermelho de proposito)\n'
else
  psql_file "$mig_fix" >/dev/null
fi

# U3 consome list_products MANDANDO p_limit=1 e p_window_ms=1 (o que um cliente hostil faria).
expect_value_as 'B.1 o limite vem da politica confiavel (120/min em list_products), nao do argumento' '120' "$J3" \
  "SELECT count(*) FROM generate_series(1,120) g WHERE public.catalog_rate_limit_hit('$U3','list_products',1,1);"
expect_value_as 'B.2 a 121a chamada e negada (a janela tambem veio da politica, nao dos 1 ms)' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',1,1);"
expect_count 'B.3 o balde tem os 121 hits (nenhum foi apagado)' '121' "$(hits_of "$U3" list_products)"

expect_value_as 'B.4 ataque p_window_ms=0 NAO zera: segue negado (false)' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',120,0);"
expect_count 'B.5 ...e o historico nao foi apagado (ganhou o hit do ataque)' '122' "$(hits_of "$U3" list_products)"
expect_value_as 'B.6 a chamada seguinte do endpoint continua negada (cota intacta)' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',120,60000);"
expect_count 'B.7 historico intacto depois do ataque' '123' "$(hits_of "$U3" list_products)"

expect_value_as 'B.8 janela negativa nao apaga nada e nega' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',120,-5000);"
expect_value_as 'B.9 janela 1 ms nao reinventa a janela e nega' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',120,1);"
expect_value_as 'B.10 janela enorme nao apaga nada e nega' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',120,999999999);"
expect_value_as 'B.11 limite arbitrario (p_limit=999999) nao libera' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',999999,60000);"
expect_value_as 'B.12 p_limit=0 nao libera' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',0,60000);"
expect_value_as 'B.13 p_limit negativo nao libera' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','list_products',-7,60000);"
expect_count 'B.14 o balde segue com todos os hits do bloco (nada foi apagado)' '129' "$(hits_of "$U3" list_products)"

# Isolamento por usuario: U5 usa a MESMA acao de U1 (cujo balde esta poluido do bloco A) e o teto
# de bootstrap e 60 mesmo com a edge/atacante mandando limite 1.
expect_value_as 'B.15 outro usuario tem balde proprio: 60 passam em bootstrap com p_limit=1' '60' "$J5" \
  "SELECT count(*) FROM generate_series(1,60) g WHERE public.catalog_rate_limit_hit('$U5','bootstrap',1,1);"
expect_value_as 'B.16 ...e a 61a dele e negada' 'f' "$J5" \
  "SELECT public.catalog_rate_limit_hit('$U5','bootstrap',1,1);"

# Acao inventada nao cria balde novo: cai no balde 'global' da politica confiavel.
expect_value_as 'B.17 acao inventada e aceita (balde global), sem criar balde novo' 't' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','acao_inventada_xyz',999999,60000);"
expect_count 'B.18 o hit da acao inventada foi gravado no balde global' '1' "$(hits_of "$U3" global)"
expect_count 'B.19 nenhum hit ficou na acao inventada' '0' "$(hits_of "$U3" acao_inventada_xyz)"
expect_value_as 'B.20 esgotar o balde global de U3 (59: o hit do ataque B.17 ja estava la)' '59' "$J3" \
  "SELECT count(*) FROM generate_series(1,60) g WHERE public.catalog_rate_limit_hit('$U3','global',60,60000);"
expect_value_as 'B.21 com o global cheio, outra acao inventada tambem e negada (sem balde novo)' 'f' "$J3" \
  "SELECT public.catalog_rate_limit_hit('$U3','outra_acao_qualquer',999999,60000);"
expect_value_as 'B.22 isolamento por acao: list_products de U1 segue no proprio balde' 't' "$J1" \
  "SELECT public.catalog_rate_limit_hit('$U1','list_products',120,60000);"

# Entrada invalida.
expect_error_as 'B.23 p_user nulo falha alto (nao grava hit e nao devolve decisao falsa)' 'p_user' "$J1" \
  "SELECT public.catalog_rate_limit_hit(NULL,'bootstrap',60,60000);"
expect_value 'B.24 o hit nulo nao entrou na tabela' '0' \
  "SELECT count(*) FROM public.catalog_rate_limit_hits WHERE user_id IS NULL;"

# ACL: a primitiva continua alcancavel por authenticated (a edge chama com o JWT do usuario) e
# nunca por anon. A migration nao cria tabela nova, RLS novo, indice novo nem grant de tabela.
expect_value 'B.25 authenticated MANTEM execute (a edge continua funcionando)' 't' \
  "SELECT has_function_privilege('authenticated','public.catalog_rate_limit_hit(uuid,text,integer,integer)','EXECUTE');"
expect_value 'B.26 anon nao executa' 'f' \
  "SELECT has_function_privilege('anon','public.catalog_rate_limit_hit(uuid,text,integer,integer)','EXECUTE');"
expect_value 'B.27 a migration nao criou tabela auxiliar de politica' 'ausente' \
  "SELECT coalesce(to_regclass('public.catalog_rate_limit_policy')::text,'ausente');"

# ======================================================================================
# BLOCO C — o ROLLBACK escrito na migration roda e devolve o estado anterior (e reaplicar e idempotente).
printf '\n============ BLOCO C — rollback executado a partir do proprio arquivo ============\n'

expect_value_as 'C.1 antes do rollback: a politica governa e o argumento nao vale (60 passam com p_limit=1)' '60' "$J7" \
  "SELECT count(*) FROM generate_series(1,60) g WHERE public.catalog_rate_limit_hit('$U7','bootstrap',1,1);"

sed -n '/^-- ===== BEGIN-ROLLBACK/,/^-- ===== END-ROLLBACK/p' "$mig_fix" | sed '1d;$d' | sed 's/^-- *//' > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'nao consegui extrair o bloco BEGIN-ROLLBACK da migration'
psql_file "$tmp_dir/rollback.sql" >/dev/null

expect_value_as 'C.2 o corpo ANTERIOR voltou: o argumento volta a mandar (so 1 passa com p_limit=1)' '1' "$J9" \
  "SELECT count(*) FROM generate_series(1,60) g WHERE public.catalog_rate_limit_hit('$U9','bootstrap',1,1);"
expect_value_as 'C.3 ...inclusive o expurgo: janela 0 zera a chave de novo' 't' "$J9" \
  "SELECT public.catalog_rate_limit_hit('$U9','bootstrap',60,0);"
expect_count 'C.4 ...e o balde ficou vazio (defeito de volta, como no bloco A)' '0' "$(hits_of "$U9" bootstrap)"

psql_file "$mig_fix" >/dev/null
expect_value_as 'C.5 reaplicar a migration e idempotente: a correcao volta a valer (60 passam com p_limit=1)' '60' "$J11" \
  "SELECT count(*) FROM generate_series(1,60) g WHERE public.catalog_rate_limit_hit('$U11','bootstrap',1,1);"
expect_value_as 'C.6 ...e o teto volta a ser o da politica (a 61a e negada)' 'f' "$J11" \
  "SELECT public.catalog_rate_limit_hit('$U11','bootstrap',1,1);"
expect_value 'C.7 reaplicar a migration continua sem tabela/RLS/indice novo de politica' 'ausente' \
  "SELECT coalesce(to_regclass('public.catalog_rate_limit_policy')::text,'ausente');"

printf '\nPASS: R2-DB-010 — a cota do catalogo vem de politica confiavel na funcao; janela e limite arbitrarios por RPC direta nao apagam hits nem liberam a requisicao; o rollback devolve o estado anterior e reaplicar e idempotente sem criar tabela/RLS/indice novo.\n'