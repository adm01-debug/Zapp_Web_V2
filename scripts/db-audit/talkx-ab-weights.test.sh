#!/usr/bin/env bash
# N-103 Talk X: pesos das variantes somam 100 e atribuicao estável.
#
# Contrato num PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-audience-snapshot.test.sh, scripts/db-audit/talkx-role-gates.test.sh).
#
# Aplica a migration N-103 REAL (supabase/migrations/*_talkx_ab_weights_constraint.sql)
# sobre um schema minimo com a tabela talkx_template_variants, e prova:
#   (a) migration aplica e e replayavel; trigger e functions existem;
#       e a migration NAO carrega DDL de colunas A/B (escopo da constraint);
#   (b) INSERT com pesos validos (soma=100) — aceito;
#   (c) INSERT com pesos invalidos (60+40+30=130) — rejeitado com SQLSTATE 22023;
#   (d) UPDATE que quebra a soma — rejeitado com SQLSTATE 22023;
#   (e) UPDATE que mantem a soma — aceito;
#   (f) DELETE que quebra a soma — rejeitado com SQLSTATE 22023;
#   (g) DELETE que deixa o template vazio — aceito, e assign_variant em template
#       vazio levanta 22023 (sem fallback silencioso);
#   (h) troca de template_id: rejeitada quando o template antigo deixa de somar 100,
#       aceita quando ambos ficam em 100;
#   (i) talkx_assign_variant: o mesmo contato recebe a mesma variante em 2 snapshots;
#   (j) contatos distintos respeitam os pesos (distribuicao A=60 / B=40);
#   (k) authenticated nao executa talkx_assign_variant (grant so para service_role);
#   (l) escopo: a migration nao carrega DDL das colunas A/B (ab_*) em talkx_campaigns.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
# TALKX_AB_WEIGHTS_MIGRATION permite a prova vermelho-verde: rodar ESTE teste
# contra a migration anterior (que falha) e contra a migration atual (que passa).
if [[ -n "${TALKX_AB_WEIGHTS_MIGRATION:-}" ]]; then
  migration_n103="$TALKX_AB_WEIGHTS_MIGRATION"
else
  mapfile -t migration_candidates < <(ls -1 "$repo_root"/supabase/migrations/*_talkx_ab_weights_constraint.sql 2>/dev/null || true)
  [[ "${#migration_candidates[@]}" == '1' ]] \
    || { printf 'FAIL: esperava exatamente 1 migration talkx_ab_weights_constraint, achei %s\n' "${#migration_candidates[@]}" >&2; exit 1; }
  migration_n103="${migration_candidates[0]}"
fi
postgres_image="${TALKX_AB_WEIGHTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
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

# Schema minimo: tabelas talkx_templates e talkx_template_variants.
# A migration N-103 nao referencia talkx_campaigns/profiles (nenhum DDL de A/B),
# entao o schema minimo nao precisa delas.
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

-- talkx_campaigns e profiles existem no banco real e sao criadas aqui para que
-- o harness tambem consiga aplicar a migration ANTERIOR (prova vermelho-verde
-- via TALKX_AB_WEIGHTS_MIGRATION); a migration atual nao as referencia.
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
# (c) INSERT com pesos invalidos (60+40+30=130) — rejeitado com SQLSTATE 22023.
# ---------------------------------------------------------------------------
expect_error '(c) INSERT com pesos invalidos (60+40+30=130) -> 22023' \
  'sum to 130, expected 100' '22023' \
  "BEGIN; INSERT INTO public.talkx_template_variants (template_id, label, content, weight) VALUES ('$template_id', 'C', 'Conteudo C', 30); COMMIT;"

# ---------------------------------------------------------------------------
# (d) UPDATE que quebra a soma — rejeitado com SQLSTATE 22023.
# ---------------------------------------------------------------------------
expect_error '(d) UPDATE que quebra a soma (60+30=90) -> 22023' \
  'sum to 90, expected 100' '22023' \
  "BEGIN; UPDATE public.talkx_template_variants SET weight = 30 WHERE template_id='$template_id' AND label = 'B'; COMMIT;"

# ---------------------------------------------------------------------------
# (e) UPDATE que mantem a soma — aceito.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<SQL
BEGIN;
UPDATE public.talkx_template_variants SET weight = 50 WHERE template_id='$template_id' AND label = 'A';
UPDATE public.talkx_template_variants SET weight = 50 WHERE template_id='$template_id' AND label = 'B';
COMMIT;
SQL
sum_weight="$(psql_q "SELECT sum(weight) FROM public.talkx_template_variants WHERE template_id='$template_id'")"
[[ "$sum_weight" == '100' ]] || fail "(e) soma dos pesos deveria ser 100 apos update [obtido: $sum_weight]"
pass '(e) UPDATE que mantem a soma (50+50=100) aceito'

# Reequilibra para 60+40 (usado pelos testes de delete e distribuicao).
psql_test >/dev/null <<SQL
BEGIN;
UPDATE public.talkx_template_variants SET weight = 60 WHERE template_id='$template_id' AND label = 'A';
UPDATE public.talkx_template_variants SET weight = 40 WHERE template_id='$template_id' AND label = 'B';
COMMIT;
SQL

# ---------------------------------------------------------------------------
# (f) DELETE que quebra a soma (60) — rejeitado com SQLSTATE 22023.
# ---------------------------------------------------------------------------
expect_error '(f) DELETE que quebra a soma (60) -> 22023' \
  'sum to 60, expected 100' '22023' \
  "BEGIN; DELETE FROM public.talkx_template_variants WHERE template_id='$template_id' AND label = 'B'; COMMIT;"

# ---------------------------------------------------------------------------
# (g) DELETE que deixa o template vazio — aceito; assign_variant em template
#     vazio levanta 22023 (sem fallback silencioso).
# ---------------------------------------------------------------------------
empty_template="$(psql_q "INSERT INTO public.talkx_templates (name) VALUES ('Empty Template') RETURNING id;")"
psql_test >/dev/null <<SQL
BEGIN;
INSERT INTO public.talkx_template_variants (template_id, label, content, weight) VALUES ('$empty_template', 'A', 'X', 100);
COMMIT;
SQL
psql_test >/dev/null <<SQL
BEGIN;
DELETE FROM public.talkx_template_variants WHERE template_id='$empty_template';
COMMIT;
SQL
empty_count="$(psql_q "SELECT count(*) FROM public.talkx_template_variants WHERE template_id='$empty_template'")"
[[ "$empty_count" == '0' ]] || fail "(g) template vazio deveria ter 0 variantes [obtido: $empty_count]"
pass '(g) DELETE de todas as variantes (template vazio) aceito'

expect_error '(g) assign_variant em template vazio -> 22023 (sem fallback)' \
  'has no variant covering bucket' '22023' \
  "SELECT public.talkx_assign_variant('a1111111-1111-1111-1111-111111111111'::uuid, '$empty_template'::uuid);"

# ---------------------------------------------------------------------------
# (h) troca de template_id.
# ---------------------------------------------------------------------------
# Template A: A=60,B=40 (ja criado). Template B: A=100.
template_b="$(psql_q "INSERT INTO public.talkx_templates (name) VALUES ('Template B') RETURNING id;")"
psql_test >/dev/null <<SQL
BEGIN;
INSERT INTO public.talkx_template_variants (template_id, label, content, weight) VALUES ('$template_b', 'A', 'B-A', 100);
COMMIT;
SQL

# (h1) troca que deixa o template ANTIGO em 60 — rejeitada.
expect_error '(h1) UPDATE template_id deixa o template antigo em 60 -> 22023' \
  'sum to 60, expected 100' '22023' \
  "BEGIN; UPDATE public.talkx_template_variants SET weight=60 WHERE template_id='$template_b' AND label='A'; UPDATE public.talkx_template_variants SET template_id='$template_b', label='C' WHERE template_id='$template_id' AND label='B'; COMMIT;"

# (h2) troca que mantem ambos em 100 — aceita.
swap_src="$(psql_q "INSERT INTO public.talkx_templates (name) VALUES ('Swap Src') RETURNING id;")"
swap_dst="$(psql_q "INSERT INTO public.talkx_templates (name) VALUES ('Swap Dst') RETURNING id;")"
psql_test >/dev/null <<SQL
BEGIN;
INSERT INTO public.talkx_template_variants (template_id, label, content, weight)
VALUES ('$swap_src', 'A', 'S-A', 50), ('$swap_src', 'B', 'S-B', 50);
COMMIT;
SQL
psql_test >/dev/null <<SQL
BEGIN;
UPDATE public.talkx_template_variants SET weight = 100 WHERE template_id='$swap_src' AND label='A';
UPDATE public.talkx_template_variants SET template_id='$swap_dst', label='C', weight = 100 WHERE template_id='$swap_src' AND label='B';
COMMIT;
SQL
sum_a="$(psql_q "SELECT COALESCE(sum(weight),0) FROM public.talkx_template_variants WHERE template_id='$swap_src'")"
sum_b="$(psql_q "SELECT COALESCE(sum(weight),0) FROM public.talkx_template_variants WHERE template_id='$swap_dst'")"
[[ "$sum_a" == '100' && "$sum_b" == '100' ]] || fail "(h2) esperava 100/100 [obtido: $sum_a/$sum_b]"
pass '(h2) UPDATE template_id mantendo ambos em 100 aceito'

# Reconstroi o template de distribuicao como 60/40 para (i)/(j).
dist_template="$(psql_q "INSERT INTO public.talkx_templates (name) VALUES ('Dist Template') RETURNING id;")"
psql_test >/dev/null <<SQL
BEGIN;
INSERT INTO public.talkx_template_variants (template_id, label, content, weight)
VALUES ('$dist_template', 'A', 'Dist A', 60), ('$dist_template', 'B', 'Dist B', 40);
COMMIT;
SQL

# ---------------------------------------------------------------------------
# (i) dois snapshots seguidos: o mesmo contato recebe a mesma variante.
# ---------------------------------------------------------------------------
contact_id="a1111111-1111-1111-1111-111111111111"
snapshot1="$(psql_q "SELECT public.talkx_assign_variant('$contact_id'::uuid, '$dist_template'::uuid);")"
snapshot2="$(psql_q "SELECT public.talkx_assign_variant('$contact_id'::uuid, '$dist_template'::uuid);")"
[[ -n "$snapshot1" && "$snapshot1" == "$snapshot2" ]] \
  || fail "(i) mesmo contato recebeu variantes diferentes em 2 snapshots: '$snapshot1' vs '$snapshot2'"
label1="$(psql_q "SELECT label FROM public.talkx_template_variants WHERE id='$snapshot1'")"
pass "(i) snapshots 1 e 2 do contato $contact_id -> variante $label1 (estavel)"

# ---------------------------------------------------------------------------
# (j) contatos distintos respeitam os pesos (A=60 / B=40) sobre 400 contatos.
# ---------------------------------------------------------------------------
count_a="$(psql_q "
  SELECT count(*) FROM (
    SELECT public.talkx_assign_variant(md5('n103-contact-'||g)::uuid, '$dist_template'::uuid) AS vid
    FROM generate_series(1,400) g
  ) a
  JOIN public.talkx_template_variants v ON v.id = a.vid
  WHERE v.label = 'A';")"
(( count_a >= 200 && count_a <= 280 )) \
  || fail "(j) contatos A deveria ficar entre 200 e 280 de 400 (peso 60%), obtido $count_a"
pass "(j) distribuicao respeita os pesos: $count_a/400 atribuidos a variante A (peso 60%)"

# ---------------------------------------------------------------------------
# (k) authenticated nao executa talkx_assign_variant (grant so para service_role).
# ---------------------------------------------------------------------------
expect_error '(k) authenticated nao executa talkx_assign_variant -> 42501' \
  'permission denied' '42501' \
  "SET LOCAL ROLE authenticated; SELECT public.talkx_assign_variant('$contact_id'::uuid, '$dist_template'::uuid);"

# ---------------------------------------------------------------------------
# (l) Escopo: a migration nao carrega DDL das colunas A/B em talkx_campaigns.
# ---------------------------------------------------------------------------
if grep -qE 'ADD COLUMN.*ab_(enabled|metric|min_sample|winner)' "$migration_n103"; then
  fail '(l) a migration ainda adiciona colunas ab_* (DDL de A/B fora do escopo)'
fi
pass '(l) a migration nao adiciona colunas ab_* (escopo restrito a constraint/atribuicao)'

printf 'PASS: N-103 talkx_ab_weights_constraint — constraint de soma de pesos (INSERT/UPDATE/DELETE/troca de template), atribuicao estavel, distribuicao, replayavel e grants\n'
