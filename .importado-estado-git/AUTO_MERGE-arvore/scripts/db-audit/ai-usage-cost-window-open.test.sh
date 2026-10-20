#!/usr/bin/env bash
# Item 265 (R2-AUTH-041, P2) — a consulta de CUSTO do painel de IA recebia
# `p_until` nulo (janela aberta ate agora) e comparava `l.created_at < NULL`:
# comparacao com NULL e desconhecida, o WHERE nao passava nenhuma linha e o
# relatorio de custo zerava TODAS as chamadas da janela enquanto o resumo de
# tokens (IA-056, `coalesce(p_until, now())`) mostrava os mesmos registros.
#
# BLOCO A (antes): com a definicao vigente na base (IA-055,
#   supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql), fim nulo
#   devolve 0 chamadas — o defeito — enquanto a MESMA janela com fim informado
#   devolve as linhas (controle: as chamadas existem; o que as elimina e o nulo).
# BLOCO B (depois): com a correcao (20261006200459_ia_usage_cost_janela_aberta.sql),
#   fim nulo = janela aberta ate agora e devolve as mesmas linhas de `now()`,
#   o fim informado continua EXCLUSIVO, o inicio continua limitando e a
#   declaracao `filtros.until_efetivo` mostra a janela realmente usada.
#
# O teste roda o SQL de verdade em um PostgreSQL descartavel: nada de producao,
# nenhuma credencial, nenhuma chamada a provedor.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_migration="$repo_root/supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql"
migration="$repo_root/supabase/migrations/20261006200459_ia_usage_cost_janela_aberta.sql"
postgres_image="${AI_USAGE_COST_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-ai-cost-window-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-ai-cost-window-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_true() {
  local label="$1" sql="$2" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "t" ]] || fail "$label: esperado 't', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$base_migration" ]] || fail "migration base nao encontrada: $base_migration"
[[ -f "$migration" ]] || fail "migration da correcao nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=*** "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# Papeis e dependencias minimas: a migration e `security invoker` e le
# `auth.uid()`/`is_admin_or_supervisor` so para declarar o escopo.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     ), '')::uuid $$;

CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  model text,
  created_at timestamptz NOT NULL,
  total_tokens integer
);

CREATE TABLE public.ai_model_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL,
  unit text NOT NULL,
  unit_price numeric NOT NULL,
  currency text NOT NULL,
  source text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
SQL

# Fixture: 3 chamadas dentro de 1 dia (uma delas de modelo sem tarifa) e 1 fora.
cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.ai_usage_logs;
DELETE FROM public.ai_model_prices;

INSERT INTO public.ai_model_prices (model, unit, unit_price, currency, source, valid_from, valid_to)
VALUES ('gpt-x', 'token', 0.000002, 'USD', 'internal', now() - interval '30 days', null);

INSERT INTO public.ai_usage_logs (id, function_name, model, created_at, total_tokens) VALUES
  ('10000000-0000-0000-0000-000000000001', 'ai-generate',           'gpt-x',                now() - interval '2 hours',  1000),
  ('10000000-0000-0000-0000-000000000002', 'ai-classify-tickets',   'gpt-x',                now() - interval '1 hour',    500),
  ('10000000-0000-0000-0000-000000000003', 'ai-generate',           'modelo-sem-tarifa',    now() - interval '3 hours',   200),
  ('10000000-0000-0000-0000-000000000004', 'ai-generate',           'gpt-x',                now() - interval '10 days',   999);
SQL

psql_file "$tmp_dir/pre.sql"
# A definicao vigente na base (o defeito) — nao uma copia: o proprio arquivo.
psql_file "$base_migration"
psql_file "$tmp_dir/seed.sql"

CUSTO_NULO_1D="public.ai_usage_cost_summary(now() - interval '1 day', null, 10)"

echo '── BLOCO A: ANTES da correcao (o defeito) ─────────────────────────────────────────'
expect_true 'A1 o painel pede a janela inteira com fim nulo e recebe 0 chamadas' \
  "SELECT ($CUSTO_NULO_1D ->> 'chamadas') = '0'"
expect_true 'A2 controle: as 3 chamadas existem na janela quando o fim e informado' \
  "SELECT (public.ai_usage_cost_summary(now() - interval '1 day', now(), 10) ->> 'chamadas') = '3'"
expect_true 'A3 controle: com fim informado o custo era medido (0.003 no gpt-x)' \
  "SELECT (public.ai_usage_cost_summary(now() - interval '1 day', now(), 10) ->> 'custo_medido')::numeric = 0.003"

echo
echo '── Aplicando a correcao ────────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS da correcao ─────────────────────────────────────────────────────'
expect_true 'B1 fim nulo devolve as 3 chamadas da janela (era 0)' \
  "SELECT ($CUSTO_NULO_1D ->> 'chamadas') = '3'"
expect_true 'B2 fim nulo e fim informado leem a MESMA janela (so o rotulo difere)' \
  "SELECT ((($CUSTO_NULO_1D) - 'filtros') = ((public.ai_usage_cost_summary(now() - interval '1 day', now(), 10)) - 'filtros'))"
expect_true 'B3 o custo volta com fim nulo (0.003) e nao zero' \
  "SELECT ($CUSTO_NULO_1D ->> 'custo_medido')::numeric = 0.003"
expect_true 'B4 a linha sem tarifa continua CONTADA, nunca como zero' \
  "SELECT ($CUSTO_NULO_1D #>> '{sem_tarifa,modelo_sem_tarifa}') = '1'"
expect_true 'B5 o inicio continua limitando: a chamada de 10 dias fica fora' \
  "SELECT (public.ai_usage_cost_summary(now() - interval '4 days', null, 10) ->> 'chamadas') = '3'"
expect_true 'B6 o fim informado continua EXCLUSIVO (2 chamadas antes de 90 min)' \
  "SELECT (public.ai_usage_cost_summary(now() - interval '4 days', now() - interval '90 minutes', 10) ->> 'chamadas') = '2'"
expect_true 'B7 a resposta declara a janela usada quando o fim vem nulo' \
  "SELECT ($CUSTO_NULO_1D #>> '{filtros,until_efetivo}') IS NOT NULL"
expect_true 'B8 o fim PEDIDO continua declarado nulo, separado do efetivo' \
  "SELECT ($CUSTO_NULO_1D #>> '{filtros,until}') IS NULL"

echo
echo '[OK] item 265: fim nulo abre a janela em vez de eliminar todas as chamadas'
