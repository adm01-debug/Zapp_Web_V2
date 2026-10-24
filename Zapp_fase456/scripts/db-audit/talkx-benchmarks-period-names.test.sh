#!/usr/bin/env bash
# Harness descartavel: N-123 / X075 — talkx_benchmarks(p_days, p_limit) com nomes.
# Prova: a assinatura antiga sem argumentos e removida; a nova devolve nome de segmento
# (so para admin/supervisor) e de template, volume enviado (sent_count), templates
# ordenados por taxa de resposta e has_baseline (true com 5+ campanhas concluidas na
# janela). Aplica os ARQUIVOS de migration reais num PostgreSQL 17 descartavel e roda
# como o papel real (SET LOCAL ROLE authenticated), nunca como postgres no caminho feliz.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

test_password='talkx_benchmarks_test_only'
cid="talkx-benchmarks-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-benchmarks-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD="$test_password" ${POSTGRES_TEST_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24} >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid,
  template_id uuid,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_segments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_by uuid);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);

-- stub: a migration base 20260916220000 revoga EXECUTE de record_talkx_link_click(text, uuid, text, text)
CREATE FUNCTION public.record_talkx_link_click(p_external_id text, p_connection_id uuid, p_event text, p_source text)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

-- controle de admin por GUC: o proprio teste decide quem e admin/supervisor
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.is_admin', true), 'false')::boolean
$$;
SQL

# ---- migrations de base (reais) instalam a assinatura ANTIGA ----
psql_test < "$repo_root/supabase/migrations/20260916150000_talkx_e89_benchmarks.sql" >/dev/null \
  || fail 'migration base E89 (20260916150000) nao aplicou'
psql_test < "$repo_root/supabase/migrations/20260916220000_fix_talkx_benchmarks_anon_grant_and_e90_execute.sql" >/dev/null \
  || fail 'migration base E90 (20260916220000) nao aplicou'

# ---- RED: antes da correcao a assinatura (integer, integer) nao existe ----
old_exists="$(psql_q "select to_regprocedure('public.talkx_benchmarks()') is not null")"
[[ "$old_exists" == 't' ]] || fail 'RED: talkx_benchmarks() sem args deveria existir antes da correcao'

red_err="$(psql_test -Atqc "select public.talkx_benchmarks(30, 3);" 2>&1 || true)"
[[ "$red_err" == *'does not exist'* ]] || fail "RED: talkx_benchmarks(30, 3) deveria nao existir antes da correcao (got: $red_err)"

# ---- GREEN: aplica a migration NOVA ----
psql_test < "$repo_root/supabase/migrations/20261010111757_talkx_v4_x075_benchmarks_period_names.sql" >/dev/null \
  || fail 'migration X075 nao aplicou (GREEN)'

# ---- dados de apoio ----
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_segments (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'Segmento Alpha');
INSERT INTO public.talkx_templates (id, name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Template Revisao'),
  ('20000000-0000-0000-0000-000000000002', 'Template Promocao');

INSERT INTO public.talkx_campaigns (id, segment_id, template_id, status, total_recipients, sent_count, delivered_count, replied_count, started_at, completed_at) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'completed', 100, 100, 90, 30, now() - interval '2 days', now() - interval '1 day'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'completed', 100, 100, 80, 10, now() - interval '2 days', now() - interval '1 day');

INSERT INTO public.talkx_campaigns (id, segment_id, template_id, status, total_recipients, sent_count, delivered_count, replied_count, started_at, completed_at)
SELECT gen_random_uuid(), NULL, '20000000-0000-0000-0000-000000000002', 'completed', 50, 50, 40, 5, now() - interval '200 days', now() - interval '199 days'
FROM generate_series(1, 4);
SQL

# roda como authenticated com claims; is_admin controlado por GUC
admin_q() { psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='40000000-0000-0000-0000-000000000001'; SET LOCAL test.is_admin='true'; $1 COMMIT;" 2>&1 || true; }
user_q()  { psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='40000000-0000-0000-0000-000000000002'; SET LOCAL test.is_admin='false'; $1 COMMIT;" 2>&1 || true; }

# 1) assinatura antiga removida; assinatura nova presente com os tipos certos
[[ "$(psql_q "select to_regprocedure('public.talkx_benchmarks()') is null")" == 't' ]] || fail 'assinatura antiga talkx_benchmarks() nao foi removida'
[[ "$(psql_q "select to_regprocedure('public.talkx_benchmarks(integer,integer)') is not null")" == 't' ]] || fail 'assinatura nova talkx_benchmarks(integer,integer) nao existe'
[[ "$(psql_q "select p.pronargs::text || ':' || p.pronargdefaults::text from pg_proc p where p.oid = 'public.talkx_benchmarks(integer,integer)'::regprocedure")" == '2:2' ]] || fail 'assinatura nova deveria ter 2 args (integer) ambos com default'
[[ "$(psql_q "select p.proargtypes::text from pg_proc p where p.oid = 'public.talkx_benchmarks(integer,integer)'::regprocedure")" == '23 23' ]] || fail 'tipos dos args da assinatura nova inesperados (esperado int4 int4)'

# 2) chamada sem argumentos continua valida (defaults de p_days/p_limit)
[[ "$(admin_q "select public.talkx_benchmarks()->>'window_days';")" == '90' ]] || fail 'chamada sem argumentos nao devolveu window_days=90'
[[ "$(admin_q "select public.talkx_benchmarks(365, 5)->>'window_days';")" == '365' ]] || fail 'p_days nao foi respeitado'

# 3) nomes + volume enviado + ordenacao por taxa de resposta
[[ "$(admin_q "select public.talkx_benchmarks(90, 5)->'by_template'->0->>'template_name';")" == 'Template Revisao' ]] || fail 'by_template[0].template_name != Template Revisao'
[[ "$(admin_q "select public.talkx_benchmarks(90, 5)->'by_template'->0->>'avg_reply_rate_pct';")" == '30.0' ]] || fail 'by_template nao ordenou por taxa de resposta'
[[ "$(admin_q "select public.talkx_benchmarks(90, 5)->'by_template'->0->>'sent_count';")" == '100' ]] || fail 'by_template sem sent_count'
[[ "$(admin_q "select public.talkx_benchmarks(90, 5)->'by_segment'->0->>'segment_name';")" == 'Segmento Alpha' ]] || fail 'by_segment[0].segment_name != Segmento Alpha'
[[ "$(admin_q "select public.talkx_benchmarks(90, 5)->'by_segment'->0->>'sent_count';")" == '200' ]] || fail 'by_segment sem sent_count somado'

# 4) has_baseline: false na janela curta, true com historico suficiente
[[ "$(admin_q "select public.talkx_benchmarks(90, 5)->>'has_baseline';")" == 'false' ]] || fail 'has_baseline deveria ser false com 2 campanhas'
[[ "$(admin_q "select public.talkx_benchmarks(365, 5)->>'has_baseline';")" == 'true' ]] || fail 'has_baseline deveria ser true com 6 campanhas'

# 5) seguranca preservada: nao-admin nao ve by_segment; by_template segue visivel
[[ "$(user_q "select jsonb_array_length(public.talkx_benchmarks(90, 5)->'by_segment');")" == '0' ]] || fail 'nao-admin recebeu by_segment'
[[ "$(user_q "select public.talkx_benchmarks(90, 5)->'by_template'->0->>'template_name';")" == 'Template Revisao' ]] || fail 'by_template deveria seguir visivel ao authenticated'

# 6) p_limit respeitado
[[ "$(admin_q "select jsonb_array_length(public.talkx_benchmarks(90, 1)->'by_template');")" == '1' ]] || fail 'p_limit nao foi respeitado'

# 7) entrada invalida recusada
bad_days="$(admin_q "select public.talkx_benchmarks(0, 5);")"
[[ "$bad_days" == *'invalid_talkx_benchmarks_days'* ]] || fail "p_days invalido deveria ser recusado (got: $bad_days)"
bad_limit="$(admin_q "select public.talkx_benchmarks(90, 0);")"
[[ "$bad_limit" == *'invalid_talkx_benchmarks_limit'* ]] || fail "p_limit invalido deveria ser recusado (got: $bad_limit)"

# 8) ACL: authenticated executa; anon nao
[[ "$(psql_q "select has_function_privilege('authenticated', 'public.talkx_benchmarks(integer,integer)', 'EXECUTE')")" == 't' ]] || fail 'authenticated deveria ter EXECUTE'
[[ "$(psql_q "select has_function_privilege('anon', 'public.talkx_benchmarks(integer,integer)', 'EXECUTE')")" == 'f' ]] || fail 'anon NAO deveria ter EXECUTE'

echo '[OK] Talk X X075: talkx_benchmarks(p_days, p_limit) com nomes, sent_count, has_baseline e ACL.'
