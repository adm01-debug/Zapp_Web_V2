#!/usr/bin/env bash
# t_b2c0fca9 — serie DIARIA do heatmap do Dashboard (ate 365 dias, America/Sao_Paulo).
#
# Prova, em PostgreSQL 17 descartavel e com a migration REAL aplicada verbatim
# (supabase/migrations/20261016143431_dashboard_heatmap_daily_series.sql), que
# public.dashboard_heatmap_daily(p_days int default 30) devolve SEMPRE um ponto
# por dia civil da janela, no fuso do negocio:
#   * N linhas para p_days=N (7 e 365) — serie completa, mais antigo primeiro;
#   * dia sem mensagem aparece com total 0 (LEFT JOIN da serie completa);
#   * fronteira de dia em America/Sao_Paulo (nao em UTC, nao no fuso do navegador);
#   * p_days = 0 / 400 / negativo sofre clamp (1..365); nulo usa o default 30;
#   * search_path fixado; anon sem EXECUTE (so authenticated);
#   * o rollback do cabecalho da migration executa e remove o objeto.
#
# BLOCO A (defeito): antes de aplicar a migration a funcao NAO existe — e o
# teste inteiro depende dela. BLOCO B: migration aplicada, contrato verde.
#
# A tabela public.messages e um STUB com as colunas minimas que a funcao le
# (created_at, sender, is_deleted): ela vem de outra migration e NAO e o objeto
# sob teste — este e aplicado do arquivo real, nunca copiado para dentro do teste.
#
# Um unico ponto de fuso: se a virada do dia civil de Sao Paulo cair no meio da
# execucao, o teste falha com mensagem explicita em vez de mascarar (guarda da
# data, logo antes das assercoes).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261016143431_dashboard_heatmap_daily_series.sql"
migrations_dir="$repo_root/supabase/migrations"
postgres_image="${HEATMAP_DAILY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-heatmap-daily-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-heatmap-daily-test-[0-9]+$ ]]; then
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
as_role() { # $1=role $2=sql
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $1; SET search_path = public, pg_temp; $2"
}
expect_value_as() {
  local label="$1" expected="$2" role="$3" sql="$4" actual
  actual="$(as_role "$role" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_error_as() {
  local label="$1" role="$2" needle="$3" sql="$4" output status
  set +e
  output="$(as_role "$role" "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && fail "$label: deveria falhar para $role, mas passou"
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

# ── Guarda de vigencia: nenhum arquivo posterior redefine o objeto ────────────
# (o rollback do cabecalho so e fiel se a migration for a ultima definicao)
later_defs="$(cd "$migrations_dir" && grep -lE 'dashboard_heatmap_daily' *.sql | grep -v '^20261016143431_dashboard_heatmap_daily_series\.sql$' || true)"
[[ -z "$later_defs" ]] || fail "guarda de vigencia: outro arquivo cita dashboard_heatmap_daily: $later_defs"
printf '[PASS] vigencia: so a migration deste cartao define dashboard_heatmap_daily\n'

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

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

# ── Schema minimo: roles reais e stub de public.messages ─────────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;

CREATE TABLE public.messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sender     text NOT NULL DEFAULT 'contact',
  is_deleted boolean
);

-- No banco real os papeis ja tem SELECT em messages (a funcao e SECURITY INVOKER,
-- entao le sob a RLS e o GRANT do chamador); aqui o stub precisa do mesmo GRANT.
GRANT SELECT ON public.messages TO authenticated;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# ── BLOCO A — defeito: a funcao ainda nao existe ─────────────────────────────
expect_value 'A1 (defeito) dashboard_heatmap_daily ausente antes da migration' 'f' \
  "SELECT to_regprocedure('public.dashboard_heatmap_daily(integer)') IS NOT NULL"

# ── Migration REAL aplicada verbatim ─────────────────────────────────────────
psql_file "$migration" >/dev/null
printf '[PASS] migration aplicada: %s\n' "$(basename "$migration")"

expect_value 'A2 (defeito) funcao existe depois da migration' 't' \
  "SELECT to_regprocedure('public.dashboard_heatmap_daily(integer)') IS NOT NULL"

# ── Fixtures (datas civis de Sao Paulo, calculadas no banco) ─────────────────
sp_today="$(psql_sql "SELECT ((now() at time zone 'America/Sao_Paulo')::date)::text")"
[[ "$sp_today" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "data de hoje inesperada: $sp_today"

# m1: hoje 00:30 SP (inbound) -> conta em hoje
# m2: (hoje-1) 23:30 SP       -> em UTC ja e hoje, mas o bucket do negocio e ontem
# m3: hoje 10:00 SP, sender 'agent'   -> nao e inbound, nao conta
# m4: hoje 11:00 SP, is_deleted true  -> soft delete, nao conta
# m5: (hoje-400) 12:00 SP, inbound    -> fora de qualquer janela <= 365 dias
psql_sql "INSERT INTO public.messages (created_at, sender, is_deleted) VALUES
  ((('$sp_today'::date + interval '30 minutes')::timestamp at time zone 'America/Sao_Paulo'), 'contact', false),
  (((('$sp_today'::date - 1) + interval '23 hours 30 minutes')::timestamp at time zone 'America/Sao_Paulo'), 'contact', false),
  ((('$sp_today'::date + interval '10 hours')::timestamp at time zone 'America/Sao_Paulo'), 'agent', false),
  ((('$sp_today'::date + interval '11 hours')::timestamp at time zone 'America/Sao_Paulo'), 'contact', true),
  (((('$sp_today'::date - 400) + interval '12 hours')::timestamp at time zone 'America/Sao_Paulo'), 'contact', false)" >/dev/null

# Guarda da data: se a virada do dia civil SP caiu no meio, falha em vez de mascarar.
sp_today_now="$(psql_sql "SELECT ((now() at time zone 'America/Sao_Paulo')::date)::text")"
[[ "$sp_today_now" == "$sp_today" ]] || fail "virada do dia civil de Sao Paulo durante o teste ($sp_today -> $sp_today_now)"

# ── BLOCO B — contrato da serie diaria ───────────────────────────────────────
expect_value 'B1 p_days=7 devolve 7 linhas (1 por dia)   [serie completa]' '7' \
  "SELECT count(*) FROM public.dashboard_heatmap_daily(7)"
expect_value 'B2 p_days=7 comeca em hoje-6 e termina em hoje' "t" \
  "SELECT min(dia) = '$sp_today'::date - 6 AND max(dia) = '$sp_today'::date FROM public.dashboard_heatmap_daily(7)"
expect_value 'B3 p_days=365 devolve 365 linhas' '365' \
  "SELECT count(*) FROM public.dashboard_heatmap_daily(365)"
expect_value 'B4 p_days=365: 365 dias distintos, de hoje-364 a hoje' "t" \
  "SELECT count(DISTINCT dia) = 365 AND min(dia) = '$sp_today'::date - 364 AND max(dia) = '$sp_today'::date FROM public.dashboard_heatmap_daily(365)"

expect_value 'B5 hoje conta so o inbound nao apagado (1: agent e soft delete fora)' '1' \
  "SELECT total FROM public.dashboard_heatmap_daily(7) WHERE dia = '$sp_today'::date"
expect_value 'B6 (hoje-1) 23:30 SP conta em HOJE-1, nao em hoje   [fronteira SP]' '1' \
  "SELECT total FROM public.dashboard_heatmap_daily(7) WHERE dia = '$sp_today'::date - 1"
expect_value 'B7 o mesmo instante tem data UTC = hoje (prova que o bucket nao e UTC)' "$sp_today" \
  "SELECT ((created_at at time zone 'UTC')::date)::text FROM public.messages WHERE sender='contact' AND is_deleted IS NOT TRUE AND created_at >= (('$sp_today'::date - 1)::timestamp at time zone 'America/Sao_Paulo') ORDER BY created_at LIMIT 1"
expect_value 'B8 dia sem mensagem aparece com total 0 (linha existe, LEFT JOIN)' '0' \
  "SELECT total FROM public.dashboard_heatmap_daily(7) WHERE dia = '$sp_today'::date - 3"
expect_value 'B9 na janela de 365 dias, 363 dias zerados e 2 com contagem' '363' \
  "SELECT count(*) FROM public.dashboard_heatmap_daily(365) WHERE total = 0"
expect_value 'B10 mensagem de 400 dias atras nao entra na janela de 365' 'f' \
  "SELECT EXISTS (SELECT 1 FROM public.dashboard_heatmap_daily(365) WHERE dia = '$sp_today'::date - 400)"

# ── Clamp 1..365 ─────────────────────────────────────────────────────────────
expect_value 'C1 p_days=0 sofre clamp para 1' '1' "SELECT count(*) FROM public.dashboard_heatmap_daily(0)"
expect_value 'C2 p_days=-5 sofre clamp para 1' '1' "SELECT count(*) FROM public.dashboard_heatmap_daily(-5)"
expect_value 'C3 p_days=400 sofre clamp para 365' '365' "SELECT count(*) FROM public.dashboard_heatmap_daily(400)"
expect_value 'C4 p_days=NULL usa o default 30' '30' "SELECT count(*) FROM public.dashboard_heatmap_daily(NULL)"
expect_value 'C5 p_days=1 devolve so hoje' "t" \
  "SELECT count(*) = 1 AND min(dia) = '$sp_today'::date FROM public.dashboard_heatmap_daily(1)"

# ── search_path e ACL ────────────────────────────────────────────────────────
expect_value 'D1 search_path fixado na funcao' "t" \
  "SELECT 'search_path=pg_catalog, public' = ANY(proconfig) FROM pg_proc WHERE oid = 'public.dashboard_heatmap_daily(integer)'::regprocedure"
expect_value 'D2 anon SEM EXECUTE' 'f' \
  "SELECT has_function_privilege('anon', 'public.dashboard_heatmap_daily(integer)', 'EXECUTE')"
expect_value 'D3 authenticated COM EXECUTE' 't' \
  "SELECT has_function_privilege('authenticated', 'public.dashboard_heatmap_daily(integer)', 'EXECUTE')"
expect_error_as 'D4 anon chamando a RPC morre na ACL' 'anon' 'permission denied' \
  "SELECT count(*) FROM public.dashboard_heatmap_daily(7)"
expect_value_as 'D5 authenticated chama a RPC e recebe a serie (7 linhas)' '7' 'authenticated' \
  "SELECT count(*) FROM public.dashboard_heatmap_daily(7)"
expect_value_as 'D6 authenticated ve a contagem de hoje (RLS do chamador)' '1' 'authenticated' \
  "SELECT total FROM public.dashboard_heatmap_daily(7) WHERE dia = '$sp_today'::date"

# ── Rollback do cabecalho: extraido do arquivo real e executado ──────────────
awk '/^-- Rollback \(SQL execut/ {inb=1; next}
     inb && /^--   / { line=$0; sub(/^--   /, "", line); print line; next }
     inb { exit }' "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'rollback do cabecalho nao contem SQL executavel'
printf '[INFO] rollback extraido do cabecalho:\n'; sed 's/^/       /' "$tmp_dir/rollback.sql"
psql_file "$tmp_dir/rollback.sql" >/dev/null || fail 'o rollback do cabecalho nao executou'
expect_value 'E1 rollback remove a funcao' 'f' \
  "SELECT to_regprocedure('public.dashboard_heatmap_daily(integer)') IS NOT NULL"
expect_error_as 'E2 apos o rollback a RPC nao existe mais para authenticated' 'authenticated' 'does not exist' \
  "SELECT count(*) FROM public.dashboard_heatmap_daily(7)"

printf '\n[OK] contrato da serie diaria do heatmap (t_b2c0fca9) verificado em PostgreSQL descartavel\n'
