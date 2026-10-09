#!/usr/bin/env bash
# N-103 Talk X: pesos das variantes somam 100 e atribuicao estável.
#
# Contrato num PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-audience-snapshot.test.sh, scripts/db-audit/talkx-role-gates.test.sh).
#
# Aplica a migration N-103 REAL (20261009224333, talkx_ab_weights_constraint)
# sobre um schema minimo com a tabela talkx_template_variants, e prova:
#   (a) migration aplica e e replayavel; trigger e function existem;
#   (b) INSERT com pesos validos (soma=100) — aceito;
#   (c) INSERT com pesos invalidos (soma!=100) — rejeitado com SQLSTATE 22023;
#   (d) UPDATE que quebra a soma — rejeitado com SQLSTATE 22023;
#   (e) UPDATE que mantem a soma — aceito.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration_n103="$repo_root/supabase/migrations/20261009224333_talkx_ab_weights_constraint.sql"
postgres_image="${TALKX_AB_WEIGHTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-ab-weights-test-$$"
test_password="talkx_ab_weights_test_only"

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

# Schema minimo: tabelas talkx_templates, talkx_template_variants e
# talkx_campaigns (necessaria para que a migration aplique sem erro
# de dependencia — a migration tambem adiciona colunas AB a
# talkx_campaigns).
psql_test >/dev/null <<'SQL'
CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'rascunho',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  content text NOT NULL,
  media_url text,
  media_type text,
  weight integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_template_variants_label_check CHECK (label = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])),
  CONSTRAINT talkx_template_variants_weight_check CHECK (weight > 0 AND weight <= 100)
);
CREATE INDEX idx_talkx_template_variants_template ON public.talkx_template_variants (template_id);
CREATE UNIQUE INDEX talkx_template_variants_template_id_label_key ON public.talkx_template_variants (template_id, label);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.talkx_templates(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Roles necessarios para que a migration nao falhe no REVOKE/GRANT.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;
SQL

[[ -f "$migration_n103" ]] || fail "migration ausente: $migration_n103"
psql_test < "$migration_n103" >/dev/null
# Replayavel: uma segunda aplicacao nao pode falhar.
psql_test < "$migration_n103" >/dev/null
pass '(a) migration N-103 aplica sobre o schema minimo e e replayavel'

# Verifica que o trigger e a function existem.
[[ "$(psql_q "SELECT count(*) FROM pg_trigger WHERE tgname = 'talkx_template_variants_weight_sum'")" == '1' ]] \
  || fail '(a) trigger talkx_template_variants_weight_sum ausente'
pass '(a) trigger talkx_template_variants_weight_sum existe'

[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname = 'talkx_validate_template_variant_weights'")" == '1' ]] \
  || fail '(a) function talkx_validate_template_variant_weights ausente'
pass '(a) function talkx_validate_template_variant_weights existe'

[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname = 'talkx_assign_variant'")" == '1' ]] \
  || fail '(a) function talkx_assign_variant ausente'
pass '(a) function talkx_assign_variant existe'

# ---------------------------------------------------------------------------
# (b) INSERT com pesos validos (soma=100) — aceito.
# ---------------------------------------------------------------------------
template_id="$(psql_q "INSERT INTO public.talkx_templates (name) VALUES ('Test Template') RETURNING id;")"
psql_test >/dev/null <<SQL
BEGIN;
INSERT INTO public.talkx_template_variants (template_id, label, content, weight)
VALUES
  ('$template_id', 'A', 'Conteudo A', 60),
  ('$template_id', 'B', 'Conteudo B', 40);
COMMIT;
SQL
count="$(psql_q "SELECT count(*) FROM public.talkx_template_variants WHERE template_id='$template_id'")"
[[ "$count" == '2' ]] || fail "(b) deveriam existir 2 variantes [obtido: $count]"
pass '(b) INSERT com pesos validos (60+40=100) aceito'

# ---------------------------------------------------------------------------
# (c) INSERT com pesos invalidos (soma!=100) — rejeitado com SQLSTATE 22023.
# ---------------------------------------------------------------------------
expect_error '(c) INSERT com pesos invalidos (soma=90) -> 22023' \
  'Variant weights for template' '22023' \
  "BEGIN; INSERT INTO public.talkx_template_variants (template_id, label, content, weight) VALUES ('$template_id', 'C', 'Conteudo C', 30); COMMIT;"

# ---------------------------------------------------------------------------
# (d) UPDATE que quebra a soma — rejeitado com SQLSTATE 22023.
# ---------------------------------------------------------------------------
expect_error '(d) UPDATE que quebra a soma (60+30=90) -> 22023' \
  'Variant weights for template' '22023' \
  "BEGIN; UPDATE public.talkx_template_variants SET weight = 30 WHERE label = 'B'; COMMIT;"

# ---------------------------------------------------------------------------
# (e) UPDATE que mantem a soma — aceito.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<SQL
BEGIN;
UPDATE public.talkx_template_variants SET weight = 50 WHERE label = 'A';
UPDATE public.talkx_template_variants SET weight = 50 WHERE label = 'B';
COMMIT;
SQL
sum_weight="$(psql_q "SELECT sum(weight) FROM public.talkx_template_variants WHERE template_id='$template_id'")"
[[ "$sum_weight" == '100' ]] || fail "(e) soma dos pesos deveria ser 100 apos update [obtido: $sum_weight]"
pass '(e) UPDATE que mantem a soma (50+50=100) aceito'

# ---------------------------------------------------------------------------
# (f) talkx_assign_variant: o mesmo contato recebe a mesma variante em 2 chamadas.
# ---------------------------------------------------------------------------
contact_id="a1111111-1111-1111-1111-111111111111"
variant1="$(psql_q "SELECT public.talkx_assign_variant('$contact_id'::uuid, '$template_id'::uuid);")"
variant2="$(psql_q "SELECT public.talkx_assign_variant('$contact_id'::uuid, '$template_id'::uuid);")"
[[ "$variant1" == "$variant2" ]] || fail "(f) mesmo contato recebeu variantes diferentes em 2 chamadas: $variant1 vs $variant2"
[[ -n "$variant1" ]] || fail "(f) talkx_assign_variant retornou NULL"
pass "(f) talkx_assign_variant: mesmo contato recebe a mesma variante em 2 snapshots (hash=$variant1)"

printf 'PASS: N-103 talkx_ab_weights_constraint — constraint de soma de pesos, atribuicao estavel, replayavel e protecoes de INSERT/UPDATE\n'