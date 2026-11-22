#!/usr/bin/env bash
# IA-055 §2 — o relatorio de custo de IA cobrava `unit_price * total_tokens`:
# um preco UNICO para tokens de entrada e de saida, quando o fornecedor cobra
# ~4x a 14x mais pela saida. Com tarifa unica o numero erra o custo real por um
# fator grande e passa a mentir com cara de medido.
#
# BLOCO A (antes): com a definicao vigente (20261006200459), um modelo tarifado
#   em `token` cobra a soma dos tokens por um preco so — o defeito, medido aqui
#   em numero: 900 de entrada + 100 de saida custam 0.0018 em vez de 0.00138.
# BLOCO B (depois): com 20261122190000, entrada e saida sao cobradas pelo preco
#   de cada ponta; o modelo com preco unico continua pelo caminho antigo
#   (fallback declarado); o modelo sem tarifa continua CONTADO e nunca zero; a
#   vigencia continua meio-aberta.
#
# Roda SQL de verdade em PostgreSQL descartavel: nada de producao, nenhuma
# credencial, nenhuma chamada a provedor.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_migration="$repo_root/supabase/migrations/20261003102707_ia055_custo_no_relatorio.sql"
janela_migration="$repo_root/supabase/migrations/20261006200459_ia_usage_cost_janela_aberta.sql"
migration="$repo_root/supabase/migrations/20261122190000_ia055_precos_entrada_e_saida.sql"
postgres_image="${AI_USAGE_PRICE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-ai-price-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-ai-price-test-[0-9]+$ ]]; then
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
for f in "$base_migration" "$janela_migration" "$migration"; do
  [[ -f "$f" ]] || fail "migration nao encontrada: $f"
done

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

# Papeis e dependencias minimas: a funcao e `security invoker` e le auth.uid()
# apenas para declarar o escopo. O schema de `ai_model_prices` aqui e o REAL
# (constraints incluidos), porque a migration troca o check de `unit`.
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
  created_at timestamptz NOT NULL DEFAULT now(),
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED
);

CREATE TABLE public.ai_model_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid,
  model text NOT NULL,
  unit text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  unit_price numeric(18, 8) NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  source text NOT NULL DEFAULT 'internal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_model_prices_unit_check CHECK (unit IN ('token', 'character', 'second', 'request')),
  CONSTRAINT ai_model_prices_source_check CHECK (source IN ('internal', 'provider_statement')),
  CONSTRAINT ai_model_prices_price_check CHECK (unit_price >= 0),
  CONSTRAINT ai_model_prices_currency_check CHECK (char_length(currency) = 3),
  CONSTRAINT ai_model_prices_vigencia_check CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX uq_ai_model_prices_vigencia
  ON public.ai_model_prices (model, unit, valid_from, source);
SQL

# Fixture: 3 modelos, todos dentro de 1 dia.
#  - modelo-duas-pontas: 900 entrada + 100 saida (custo real 0.00138)
#  - modelo-preco-unico: 1500 tokens, tarifa unica 0.000002 (caminho antigo)
#  - modelo-sem-tarifa:  sem preco nenhum, tem de continuar contado
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.ai_usage_logs (id, function_name, model, created_at, input_tokens, output_tokens) VALUES
  ('20000000-0000-0000-0000-000000000001', 'ai-generate',  'modelo-duas-pontas', now() - interval '3 hours', 900, 100),
  ('20000000-0000-0000-0000-000000000002', 'ai-classify',  'modelo-preco-unico', now() - interval '2 hours', 1400, 100),
  ('20000000-0000-0000-0000-000000000003', 'ai-generate',  'modelo-sem-tarifa',  now() - interval '1 hour',  900, 100);

-- Tarifa de preco unico: existe no esquema ANTIGO, entra antes da correcao.
INSERT INTO public.ai_model_prices (model, unit, unit_price, currency, source, valid_from)
VALUES ('modelo-preco-unico', 'token', 0.000002, 'USD', 'internal', now() - interval '30 days');
SQL

# Tarifas de entrada/saida so podem existir DEPOIS da correcao (o schema antigo
# tem check que as recusa) — e e exatamente o que o bloco A demonstra.
cat > "$tmp_dir/seed-duas-pontas.sql" <<'SQL'
INSERT INTO public.ai_model_prices (model, unit, unit_price, currency, source, valid_from)
VALUES ('modelo-duas-pontas', 'input_token',  0.0000012, 'USD', 'internal', now() - interval '30 days'),
       ('modelo-duas-pontas', 'output_token', 0.0000030, 'USD', 'internal', now() - interval '30 days');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$base_migration"
psql_file "$janela_migration"
psql_file "$tmp_dir/seed.sql"

CUSTO="public.ai_usage_cost_summary(now() - interval '1 day', null, 10)"

echo '── BLOCO A: ANTES da correcao (tarifa unica para entrada e saida) ──────────────'
expect_true 'A0 o schema vigente RECUSA tarifa de entrada/saida: o custo por ponta e impossivel hoje' \
  "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_prices_unit_check'
                        AND pg_get_constraintdef(oid) LIKE '%input_token%')"
expect_true 'A1 sem essas unidades, 2 das 3 chamadas ficam sem preco (e o custo delas some)' \
  "SELECT ($CUSTO #>> '{sem_tarifa,modelo_sem_tarifa}')::int = 2"

echo
echo
echo '── Aplicando a correcao ────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed-duas-pontas.sql"

echo
echo '── BLOCO B: DEPOIS da correcao ─────────────────────────────────────────────────'
expect_true 'B1 as 3 chamadas continuam contadas (nada desaparece)' \
  "SELECT ($CUSTO ->> 'chamadas') = '3'"
expect_true 'B2 so o modelo sem tarifa fica em sem_tarifa (era 2)' \
  "SELECT ($CUSTO #>> '{sem_tarifa,modelo_sem_tarifa}') = '1'"
# Isolado por funcao: 'ai-generate' so tem este modelo, entao o custo dela e o
# calculo por ponta puro — 900*0.0000012 + 100*0.0000030 = 0.00138 (se a funcao
# somasse os tokens a um preco so, daria 0.0012 ou 0.0030).
expect_true 'B3 entrada e saida cobradas por preco proprio: 900*0.0000012 + 100*0.0000030 = 0.00138' \
  "SELECT (SELECT (f ->> 'custo_medido')::numeric FROM jsonb_array_elements($CUSTO -> 'por_funcao') f
            WHERE f ->> 'funcao' = 'ai-generate') = 0.00138"
expect_true 'B4 o preco unico continua no caminho antigo: 1500*0.000002 = 0.003 (fallback declarado)' \
  "SELECT ($CUSTO #>> '{sem_tarifa,com_preco_unico}') = '1'"
expect_true 'B5 o total soma os dois caminhos: 0.00138 + 0.003 = 0.00438 (nada entra como zero)' \
  "SELECT ($CUSTO ->> 'custo_medido')::numeric = 0.00438"
# Com o fim em -90min entram 2 chamadas: duas-pontas (3h) e preco-unico (2h).
expect_true 'B6 o fim informado continua EXCLUSIVO: a chamada da ultima hora fica fora' \
  "SELECT (public.ai_usage_cost_summary(now() - interval '1 day', now() - interval '90 minutes', 10) ->> 'chamadas') = '2'"

# Tarifa futura: a vigencia comeca DEPOIS dos registros -> nao pode valer para eles.
psql_sql "INSERT INTO public.ai_model_prices (model, unit, unit_price, currency, source, valid_from)
          VALUES ('modelo-preco-unico', 'token', 99.0, 'USD', 'internal', now() + interval '1 day')" >/dev/null
expect_true 'B7 tarifa que comeca DEPOIS do registro nao vale para ele (vigencia meio-aberta)' \
  "SELECT (public.ai_usage_cost_summary(now() - interval '1 day', null, 10) ->> 'custo_medido')::numeric = 0.00438"
psql_sql "DELETE FROM public.ai_model_prices WHERE unit_price = 99.0" >/dev/null
expect_true 'B8 a unidade nova nao aceita qualquer texto (constraint ainda manda)' \
  "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_prices_unit_check'
                        AND pg_get_constraintdef(oid) LIKE '%input_token%') = false"
expect_true 'B9 a unidade inventada continua barrada pelo check' \
  "SELECT (SELECT count(*) FROM information_schema.check_constraints
            WHERE constraint_name = 'ai_model_prices_unit_check') = 1"
expect_true 'B10 o dominio de unidade declara exatamente as 6 unidades' \
  "SELECT pg_get_constraintdef(oid) LIKE '%''token''%' AND pg_get_constraintdef(oid) LIKE '%''input_token''%'
       AND pg_get_constraintdef(oid) LIKE '%''output_token''%' AND pg_get_constraintdef(oid) NOT LIKE '%''megabyte''%'
     FROM pg_constraint WHERE conname = 'ai_model_prices_unit_check'"

echo
echo '[OK] IA-055 §2: custo cobra entrada e saida separadamente, sem zero e sem preco unico escondido'