#!/usr/bin/env bash
# X103 (Fase 9 · telas 02/03 · banco + testes · DDL: sim) — estatisticas da
# biblioteca de segmentos (talkx_segment_library_stats).
#
# Contrato em PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-overview-stats.test.sh). Aplica a migration REAL
# (supabase/migrations/20261009063248_talkx_segment_library_stats.sql) sobre um
# schema minimo com os objetos que ela toca, e prova:
#
#   BLOCO A (vermelho, ANTES da migration):
#     (A1) nao existe a RPC public.talkx_segment_library_stats(text);
#     (A2) nao existe a tabela public.talkx_segment_library_history;
#     (A3) o KPI da tela hoje ("Ativos este mes" = status='active') conta 3
#          segmentos enquanto o USO REAL do mes e 2 — e sem a migration o
#          servidor nao tem como devolver o numero certo.
#
#   BLOCO B (verde, DEPOIS da migration):
#     (a) objetos + ACL: anon sem EXECUTE/SELECT; authenticated so le (nao
#         executa a rotina de escrita); service_role executa a rotina; RLS
#         ligada na tabela nova com a policy de leitura;
#     (b) KPIs: total_segments, active_this_month (uso real), variacao contra o
#         mes anterior, crm360_connected e sua variacao;
#     (c) conversao media com base suficiente (150 entregues / 15 conversoes =
#         10,0%) e delta_pp contra o mes anterior (120/6 = 5,0%);
#     (d) campanha em RASCUNHO nao conta como uso nem entra nas entregas;
#     (e) campanha MULTI-SEGMENTO (talkx_campaign_segments) conta como uso;
#     (f) sem dados suficientes (< 100 entregues) a conversao vem SEM NUMERO
#         (value_pct null, has_data false) — nunca 0 nem percentual inventado;
#     (g) serie de 8 meses vinda do historico; mes sem retrato => has_data false;
#     (h) escopo: o agente ve so o proprio (RLS sobre funcao SECURITY INVOKER) e
#         nao le o retrato da biblioteca (fail-closed);
#     (i) idempotencia: rodar a rotina duas vezes no dia mantem 1 linha por mes;
#         chamar como authenticated e negado;
#     (j) entrada invalida (0, 37, null, fuso invalido) estoura;
#     (k) tudo ou nada: falha artificial no meio da rotina nao deixa NADA gravado;
#     (l) migration replayavel (segunda aplicacao nao falha e nao duplica).
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em
# CASES_SEEN e o harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009063248_talkx_segment_library_stats.sql"
postgres_image="${TALKX_SEGMENT_LIBRARY_STATS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="talkx-segment-library-stats-test-$$"
test_password="talkx_segment_library_stats_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }
psql_err() { # psql_err "<sql>" -> imprime o stderr do psql (nao aborta)
  docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqc "$1" 2>&1 || true
}

# --- registro dos casos (ausencia de medicao = falha) -----------------------
declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  before_rpc_absent before_history_absent before_naive_kpi
  objects_acl backfill_monthly
  kpi_totals kpi_usage kpi_delta
  conversion_base conversion_previous
  draft_nao_conta multi_segmento
  sem_base_minima
  serie_8_meses serie_sem_retrato
  escopo_agente escopo_agente_serie
  idempotencia rotina_negada_authenticated
  entrada_invalida atomicidade
  replay
)
case_done() { CASES_SEEN["$1"]=1; }

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 30); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL descartavel nao estabilizou (tentativa %s/3)\n' "$attempt" >&2
  done
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ---------------------------------------------------------------------------
# Schema minimo: os objetos que a migration referencia, no formato ANTERIOR a
# ela. Espelha as colunas reais de profiles / user_roles / talkx_segments /
# talkx_campaigns / talkx_campaign_segments (X057) / talkx_recipients /
# talkx_conversions (E90+X021) e as policies de RLS do modulo.
#
# Todas as datas do fixture saem de date_trunc('month', agora em
# America/Sao_Paulo) — nada de "now() - N dias", que cruza a virada do mes e
# faria o teste piscar.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

-- talkx_segments (20260908120000 + 20260928370000)
CREATE TABLE public.talkx_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  origin text NOT NULL DEFAULT 'zapp',
  status text NOT NULL DEFAULT 'active',
  is_favorite boolean NOT NULL DEFAULT false,
  rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  estimated_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_segments_origin_check CHECK (origin IN ('zapp','crm360','custom')),
  CONSTRAINT talkx_segments_status_check CHECK (status IN ('active','inactive'))
);
ALTER TABLE public.talkx_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_segments_select ON public.talkx_segments
  FOR SELECT TO authenticated
  USING (
    (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1))
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- talkx_campaigns (recorte: as colunas que a X103 le)
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  status text NOT NULL DEFAULT 'draft',
  audience_source text NOT NULL DEFAULT 'contacts',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  segment_id uuid REFERENCES public.talkx_segments(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_campaigns_select_own ON public.talkx_campaigns
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- talkx_campaign_segments (X057)
CREATE TABLE public.talkx_campaign_segments (
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES public.talkx_segments(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, segment_id),
  CONSTRAINT talkx_campaign_segments_campaign_position_key UNIQUE (campaign_id, position)
);
ALTER TABLE public.talkx_campaign_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all campaign segments" ON public.talkx_campaign_segments
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Users can view own campaign segments" ON public.talkx_campaign_segments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talkx_campaigns c
    WHERE c.id = campaign_id
      AND c.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  ));

-- talkx_recipients (recorte)
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_recipients_select_own ON public.talkx_recipients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talkx_campaigns tc
    WHERE tc.id = campaign_id
      AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
           OR public.is_admin_or_supervisor(auth.uid()))
  ));

-- talkx_conversions (E90 + X021)
CREATE TABLE public.talkx_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  link_id uuid,
  value numeric(12,2),
  source text,
  external_ref text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.talkx_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_conversions_select ON public.talkx_conversions
  FOR SELECT TO authenticated
  USING (
    campaign_id IN (
      SELECT tc.id FROM public.talkx_campaigns tc
      WHERE tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
    OR public.is_admin_or_supervisor(auth.uid())
  );

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.user_roles, public.talkx_segments,
  public.talkx_campaigns, public.talkx_campaign_segments, public.talkx_recipients,
  public.talkx_conversions TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), auth.uid(), auth.role()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixture. Mes corrente = M; mes anterior = M-1.
--   perfis: p1 admin (u1), p3 agente sem papel (u3)
--   segmentos: s1 zapp ativo (admin), s2 crm360 ativo (admin),
--              s3 crm360 ativo e OCIOSO, criado no mes corrente (admin),
--              s4 zapp do agente, s5 zapp ativo e OCIOSO (admin)
--   campanhas: C1 concluida com s1 (iniciada em M)       -> uso real
--              C2 em envio, segmento pela LISTA X057 (s2) -> uso real
--              C3 RASCUNHO com s1 (started_at nulo)       -> nao conta
--              C4 concluida com s1 (iniciada em M-1)
--              C5 do agente com s4 (iniciada em M)        -> uso real no escopo admin
--   entregues/conversoes: C1 150/15 em M, C4 120/6 em M-1, C5 20/2 em M,
--              C3 5 entregues em M (rascunho: nao pode contar)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin');

INSERT INTO public.talkx_segments (id, name, origin, status, created_by, created_at) VALUES
  ('40000000-0000-0000-0000-000000000001', 'Segmento Zapp do admin',   'zapp',   'active',
   '10000000-0000-0000-0000-000000000001',
   (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '2 months') AT TIME ZONE 'America/Sao_Paulo'),
  ('40000000-0000-0000-0000-000000000002', 'Segmento CRM do admin',    'crm360', 'active',
   '10000000-0000-0000-0000-000000000001',
   (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '2 months') AT TIME ZONE 'America/Sao_Paulo'),
  ('40000000-0000-0000-0000-000000000003', 'Segmento CRM ocioso',      'crm360', 'active',
   '10000000-0000-0000-0000-000000000001',
   date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo'),
  ('40000000-0000-0000-0000-000000000004', 'Segmento Zapp do agente',  'zapp',   'inactive',
   '10000000-0000-0000-0000-000000000003',
   (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '1 month') AT TIME ZONE 'America/Sao_Paulo'),
  ('40000000-0000-0000-0000-000000000005', 'Segmento Zapp ocioso',     'zapp',   'active',
   '10000000-0000-0000-0000-000000000001',
   (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '2 months') AT TIME ZONE 'America/Sao_Paulo');

INSERT INTO public.talkx_campaigns (id, name, status, created_by, segment_id, started_at, completed_at) VALUES
  ('50000000-0000-0000-0000-000000000001', 'C1 com segmento',  'completed',
   '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo',
   date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '2 days'),
  ('50000000-0000-0000-0000-000000000002', 'C2 multi-segmento', 'sending',
   '10000000-0000-0000-0000-000000000001', NULL,
   date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo',
   NULL),
  ('50000000-0000-0000-0000-000000000003', 'C3 rascunho',      'draft',
   '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   NULL, NULL),
  ('50000000-0000-0000-0000-000000000004', 'C4 mes passado',   'completed',
   '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '15 days') AT TIME ZONE 'America/Sao_Paulo',
   (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '13 days') AT TIME ZONE 'America/Sao_Paulo'),
  ('50000000-0000-0000-0000-000000000005', 'C5 do agente',     'completed',
   '10000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004',
   date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo',
   date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '1 day');

INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status) VALUES
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 1, 'sending');

-- 150 entregues + 15 conversoes da C1 no mes corrente
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at)
SELECT '50000000-0000-0000-0000-000000000001', gen_random_uuid(), 'delivered',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '1 hour'
FROM generate_series(1, 150);
INSERT INTO public.talkx_conversions (campaign_id, occurred_at, created_at)
SELECT '50000000-0000-0000-0000-000000000001',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '2 hours',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '2 hours'
FROM generate_series(1, 15);

-- 120 entregues + 6 conversoes da C4 no mes anterior
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at)
SELECT '50000000-0000-0000-0000-000000000004', gen_random_uuid(), 'delivered',
       (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '15 days') AT TIME ZONE 'America/Sao_Paulo',
       (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '15 days') AT TIME ZONE 'America/Sao_Paulo' + interval '1 hour'
FROM generate_series(1, 120);
INSERT INTO public.talkx_conversions (campaign_id, occurred_at, created_at)
SELECT '50000000-0000-0000-0000-000000000004',
       (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '15 days') AT TIME ZONE 'America/Sao_Paulo' + interval '2 hours',
       (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '15 days') AT TIME ZONE 'America/Sao_Paulo' + interval '2 hours'
FROM generate_series(1, 6);

-- 20 entregues + 2 conversoes da campanha do agente no mes corrente
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at)
SELECT '50000000-0000-0000-0000-000000000005', gen_random_uuid(), 'delivered',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '1 hour'
FROM generate_series(1, 20);
INSERT INTO public.talkx_conversions (campaign_id, occurred_at, created_at)
SELECT '50000000-0000-0000-0000-000000000005',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '2 hours',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '2 hours'
FROM generate_series(1, 2);

-- 5 entregues do RASCUNHO C3 no mes corrente: nao podem entrar em conta nenhuma
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at)
SELECT '50000000-0000-0000-0000-000000000003', gen_random_uuid(), 'delivered',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo',
       date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) AT TIME ZONE 'America/Sao_Paulo' + interval '1 hour'
FROM generate_series(1, 5);
SQL

# ---------------------------------------------------------------------------
# BLOCO A — o defeito existe ANTES da migration (vermelho)
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_segment_library_stats(text)') IS NULL")" == 't' ]] \
  || fail '(A1) a RPC talkx_segment_library_stats ja existia antes da migration'
case_done before_rpc_absent
pass '(A1) antes da migration nao existe public.talkx_segment_library_stats(text)'

[[ "$(psql_q "SELECT to_regclass('public.talkx_segment_library_history') IS NULL")" == 't' ]] \
  || fail '(A2) a tabela de historico ja existia antes da migration'
case_done before_history_absent
pass '(A2) antes da migration nao existe public.talkx_segment_library_history'

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"

naive="$(psql_q "$admin_session SELECT count(*) FROM public.talkx_segments WHERE status='active'")"
[[ "$naive" == '4' ]] || fail "(A3) o KPI atual (status='active') deveria contar 4 [obtido: $naive]"
case_done before_naive_kpi
pass '(A3) o KPI do navegador (status=active) conta 4, mas o uso real do mes e 3 — numero errado, sem RPC que corrija'

# ---------------------------------------------------------------------------
# BLOCO B — aplica a migration REAL e prova a correcao
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'a migration nao aplicou'
pass '(0) migration aplicada sobre o schema minimo'

# --- (a) objetos, RLS e ACL -------------------------------------------------
stats_sig='public.talkx_segment_library_stats(text)'
month_sig='public.talkx_segment_library_month(date,text)'
refresh_sig='public.talkx_refresh_segment_library_history(integer,text)'
for sig in "$stats_sig" "$month_sig" "$refresh_sig"; do
  [[ "$(psql_q "SELECT to_regprocedure('$sig') IS NOT NULL")" == 't' ]] || fail "(a) funcao ausente: $sig"
done
[[ "$(psql_q "SELECT to_regclass('public.talkx_segment_library_history') IS NOT NULL")" == 't' ]] \
  || fail '(a) tabela de historico ausente'
[[ "$(psql_q "SELECT relrowsecurity FROM pg_class WHERE oid='public.talkx_segment_library_history'::regclass")" == 't' ]] \
  || fail '(a) tabela de historico nasceu SEM RLS'
[[ "$(psql_q "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_segment_library_history'")" == '1' ]] \
  || fail '(a) a tabela de historico deveria ter exatamente a policy de leitura'
[[ "$(psql_q "SELECT has_function_privilege('anon','$stats_sig','EXECUTE')")" == 'f' ]] || fail '(a) anon com EXECUTE na RPC'
[[ "$(psql_q "SELECT has_function_privilege('anon','$month_sig','EXECUTE')")" == 'f' ]] || fail '(a) anon com EXECUTE na medicao de mes'
[[ "$(psql_q "SELECT has_table_privilege('anon','public.talkx_segment_library_history','SELECT')")" == 'f' ]] \
  || fail '(a) anon com SELECT no historico'
[[ "$(psql_q "SELECT has_function_privilege('authenticated','$stats_sig','EXECUTE')")" == 't' ]] \
  || fail '(a) authenticated sem EXECUTE na RPC'
[[ "$(psql_q "SELECT has_function_privilege('authenticated','$refresh_sig','EXECUTE')")" == 'f' ]] \
  || fail '(a) authenticated pode executar a rotina de escrita (deveria ser so service_role)'
[[ "$(psql_q "SELECT has_function_privilege('service_role','$refresh_sig','EXECUTE')")" == 't' ]] \
  || fail '(a) service_role sem EXECUTE na rotina'
case_done objects_acl
pass '(a) objetos criados, RLS ligada, anon sem acesso, authenticated so le, rotina so do service_role'

# --- (b) retrato inicial (backfill da migration) ----------------------------
rows_total="$(psql_q 'SELECT count(*) FROM public.talkx_segment_library_history')"
rows_months="$(psql_q "SELECT count(DISTINCT date_trunc('month', counted_on)) FROM public.talkx_segment_library_history")"
[[ "$rows_total" == '8' && "$rows_months" == '8' ]] \
  || fail "(b) retrato inicial deveria ter 8 linhas em 8 meses [linhas: $rows_total, meses: $rows_months]"
case_done backfill_monthly
pass '(b) a serie nasce preenchida: 8 linhas, uma por mes (backfill idempotente da migration)'

# helper: le um caminho do JSON dos KPIs no escopo de um papel
kpi_from() { psql_q "$1 SELECT public.talkx_segment_library_stats()$2"; }

# --- (c) KPIs ---------------------------------------------------------------
total="$(kpi_from "$admin_session" "->>'total_segments'")"
crm="$(kpi_from "$admin_session" "->>'crm360_connected'")"
[[ "$total" == '5' ]] || fail "(c) total_segments esperado 5 [obtido: $total]"
[[ "$crm" == '2' ]] || fail "(c) crm360_connected esperado 2 [obtido: $crm]"
case_done kpi_totals
pass '(c) total_segments=5 e crm360_connected=2 (admin ve todo o escopo)'

ativo="$(kpi_from "$admin_session" "->>'active_this_month'")"
[[ "$ativo" == '3' ]] || fail "(c) active_this_month esperado 3 (uso real: C1+s1, C2+s2, C5+s4) [obtido: $ativo]"
case_done kpi_usage
pass '(c) active_this_month=3 = uso REAL (rascunho C3 e os 2 segmentos ociosos nao contam; discorda do status=active)'

prev="$(kpi_from "$admin_session" "->>'active_previous_month'")"
delta="$(kpi_from "$admin_session" "->>'active_delta'")"
crmprev="$(kpi_from "$admin_session" "->>'crm360_previous_month'")"
crmdelta="$(kpi_from "$admin_session" "->>'crm360_delta'")"
[[ "$prev" == '1' ]] || fail "(c) active_previous_month esperado 1 [obtido: $prev]"
[[ "$delta" == '2' ]] || fail "(c) active_delta esperado 2 [obtido: $delta]"
[[ "$crmprev" == '1' ]] || fail "(c) crm360_previous_month esperado 1 [obtido: $crmprev]"
[[ "$crmdelta" == '1' ]] || fail "(c) crm360_delta esperado 1 [obtido: $crmdelta]"
case_done kpi_delta
pass '(c) variacao contra o mes anterior: ativos 1->3 (+2) e crm360 1->2 (+1)'

# --- (d) conversao media com base suficiente --------------------------------
del="$(kpi_from "$admin_session" "->'conversion'->>'deliveries'")"
conv="$(kpi_from "$admin_session" "->'conversion'->>'conversions'")"
val="$(kpi_from "$admin_session" "->'conversion'->>'value_pct'")"
has="$(kpi_from "$admin_session" "->'conversion'->>'has_data'")"
pval="$(kpi_from "$admin_session" "->'conversion'->>'previous_pct'")"
dpp="$(kpi_from "$admin_session" "->'conversion'->>'delta_pp'")"
minb="$(kpi_from "$admin_session" "->'conversion'->>'min_deliveries'")"
[[ "$del" == '170' ]] || fail "(d) deliveries esperado 170 (C1 150 + C5 20; as 5 entregas do rascunho nao contam) [obtido: $del]"
[[ "$conv" == '17' ]] || fail "(d) conversions esperado 17 (C1 15 + C5 2) [obtido: $conv]"
[[ "$val" == '10.0' ]] || fail "(d) value_pct esperado 10.0 [obtido: $val]"
[[ "$has" == 'true' ]] || fail "(d) has_data deveria ser true com 170 entregues [obtido: $has]"
[[ "$minb" == '100' ]] || fail "(d) min_deliveries esperado 100 [obtido: $minb]"
case_done conversion_base
pass '(d) conversao media 10,0% (17/170) — rascunho C3 fora das entregas'

[[ "$pval" == '5.0' ]] || fail "(d) previous_pct esperado 5.0 (6/120 do mes anterior) [obtido: $pval]"
[[ "$dpp" == '5.0' ]] || fail "(d) delta_pp esperado 5.0 [obtido: $dpp]"
case_done conversion_previous
pass '(d) variacao da conversao contra o mes anterior = +5,0 p.p.'

# --- (e) rascunho nao conta como uso nem entra nas entregas -----------------
[[ "$ativo" == '3' && "$del" == '170' ]] \
  || fail "(e) o rascunho C3 (segmento s1, 5 entregues) entrou na conta [ativos=$ativo entregues=$del]"
case_done draft_nao_conta
pass '(e) campanha em rascunho (started_at nulo) nao conta como uso nem como entrega'

# --- (f) multi-segmento (X057) conta como uso -------------------------------
# O fixture liga s2 SO pela lista talkx_campaign_segments (nenhuma campanha tem
# segment_id = s2): tirando a linha da lista o uso cai, devolvendo-a o uso volta.
na_lista="$(psql_q "SELECT EXISTS (SELECT 1 FROM public.talkx_campaign_segments WHERE segment_id='40000000-0000-0000-0000-000000000002')")"
sem_link="$(psql_q "SELECT count(*) FROM public.talkx_campaigns WHERE segment_id='40000000-0000-0000-0000-000000000002'")"
psql_q "DELETE FROM public.talkx_campaign_segments WHERE segment_id='40000000-0000-0000-0000-000000000002'" >/dev/null
sem_lista="$(kpi_from "$admin_session" "->>'active_this_month'")"
psql_q "INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position, status)
        VALUES ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002',1,'sending')" >/dev/null
com_lista="$(kpi_from "$admin_session" "->>'active_this_month'")"
[[ "$na_lista" == 't' && "$sem_link" == '0' && "$sem_lista" == '2' && "$com_lista" == '3' ]] \
  || fail "(f) o segmento da lista X057 (s2) nao entrou no uso real [na lista: $na_lista / segment_id: $sem_link / sem a linha: $sem_lista / com a linha: $com_lista]"
case_done multi_segmento
pass '(f) segmento ligado por talkx_campaign_segments conta como uso real (2 sem a linha, 3 com ela)'

# --- (g) serie de 8 meses ---------------------------------------------------
len="$(psql_q "$admin_session SELECT jsonb_array_length(public.talkx_segment_library_stats()->'series')")"
[[ "$len" == '8' ]] || fail "(g) a serie deveria ter 8 meses [obtido: $len]"
last_month="$(psql_q "$admin_session SELECT (public.talkx_segment_library_stats()->'series'->7->>'month')::date")"
esperado_mes="$(psql_q "SELECT date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp)::date")"
[[ "$last_month" == "$esperado_mes" ]] || fail "(g) o ultimo ponto da serie deveria ser o mes corrente [obtido: $last_month]"
last_has="$(psql_q "$admin_session SELECT public.talkx_segment_library_stats()->'series'->7->>'has_data'")"
last_ativos="$(psql_q "$admin_session SELECT public.talkx_segment_library_stats()->'series'->7->>'active_segments'")"
last_conv="$(psql_q "$admin_session SELECT public.talkx_segment_library_stats()->'series'->7->>'conversion_pct'")"
prev_conv="$(psql_q "$admin_session SELECT public.talkx_segment_library_stats()->'series'->6->>'conversion_pct'")"
[[ "$last_has" == 'true' ]] || fail "(g) o ponto do mes corrente deveria ter retrato [obtido: $last_has]"
[[ "$last_ativos" == '3' ]] || fail "(g) serie do mes corrente: active_segments esperado 3 [obtido: $last_ativos]"
[[ "$last_conv" == '10.0' ]] || fail "(g) serie do mes corrente: conversion_pct esperado 10.0 [obtido: $last_conv]"
[[ "$prev_conv" == '5.0' ]] || fail "(g) serie do mes anterior: conversion_pct esperado 5.0 [obtido: $prev_conv]"
case_done serie_8_meses
pass "(g) serie de 8 meses do historico: mes corrente ativos=3 / 10,0%; mes anterior 5,0%"

# mes sem retrato => has_data false e numeros nulos (indice 2 = mes corrente - 5)
psql_q "DELETE FROM public.talkx_segment_library_history
        WHERE counted_on >= (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '5 months')::date
          AND counted_on <  (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '4 months')::date" >/dev/null
sem_has="$(psql_q "$admin_session SELECT public.talkx_segment_library_stats()->'series'->2->>'has_data'")"
sem_ativos="$(psql_q "$admin_session SELECT public.talkx_segment_library_stats()->'series'->2->>'active_segments'")"
sem_tipo="$(psql_q "$admin_session SELECT jsonb_typeof(public.talkx_segment_library_stats()->'series'->2->'active_segments')")"
[[ "$sem_has" == 'false' ]] || fail "(g) mes sem retrato deveria vir has_data=false [obtido: $sem_has]"
[[ "$sem_tipo" == 'null' ]] || fail "(g) mes sem retrato deveria vir com numero nulo [tipo: $sem_tipo / valor: $sem_ativos]"
case_done serie_sem_retrato
pass '(g) mes sem retrato no historico => has_data=false e numeros nulos (sem zero disfarcado)'

# --- (h) escopo do agente ---------------------------------------------------
agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003';"
a_total="$(kpi_from "$agent_session" "->>'total_segments'")"
a_ativo="$(kpi_from "$agent_session" "->>'active_this_month'")"
a_prev="$(kpi_from "$agent_session" "->>'active_previous_month'")"
a_crm="$(kpi_from "$agent_session" "->>'crm360_connected'")"
a_del="$(kpi_from "$agent_session" "->'conversion'->>'deliveries'")"
[[ "$a_total" == '1' ]] || fail "(h) agente deveria ver 1 segmento (o proprio) [obtido: $a_total]"
[[ "$a_ativo" == '1' ]] || fail "(h) agente: active_this_month esperado 1 [obtido: $a_ativo]"
[[ "$a_prev" == '0' ]] || fail "(h) agente: active_previous_month esperado 0 [obtido: $a_prev]"
[[ "$a_crm" == '0' ]] || fail "(h) agente: crm360_connected esperado 0 [obtido: $a_crm]"
[[ "$a_del" == '20' ]] || fail "(h) agente: deliveries esperado 20 (so a campanha dele) [obtido: $a_del]"
case_done escopo_agente
pass '(h) RLS: o agente so ve o proprio escopo (1 segmento, 20 entregues) — a funcao e SECURITY INVOKER'

# --- (i) sem base minima nao existe numero inventado -----------------------
a_has="$(kpi_from "$agent_session" "->'conversion'->>'has_data'")"
a_tipo="$(psql_q "$agent_session SELECT jsonb_typeof(public.talkx_segment_library_stats()->'conversion'->'value_pct')")"
a_dpp="$(psql_q "$agent_session SELECT jsonb_typeof(public.talkx_segment_library_stats()->'conversion'->'delta_pp')")"
[[ "$a_has" == 'false' ]] || fail "(i) com 20 entregues (< 100) has_data deveria ser false [obtido: $a_has]"
[[ "$a_tipo" == 'null' ]] || fail "(i) value_pct deveria ser null (nunca 0) [tipo: $a_tipo]"
[[ "$a_dpp" == 'null' ]] || fail "(i) delta_pp deveria ser null sem base minima [tipo: $a_dpp]"
case_done sem_base_minima
pass '(i) abaixo da base minima a conversao vem SEM numero (value_pct null, has_data false)'

# --- (j) o agente nao le o retrato da biblioteca (fail-closed) --------------
a_serie="$(psql_q "$agent_session SELECT count(*) FROM jsonb_array_elements(public.talkx_segment_library_stats()->'series') e WHERE e->>'has_data' = 'true'")"
[[ "$a_serie" == '0' ]] || fail "(j) o agente nao deveria ler o retrato da biblioteca [pontos com dado: $a_serie]"
case_done escopo_agente_serie
pass '(j) fail-closed: o retrato da biblioteca e legivel so por admin/supervisor'

# --- (k) idempotencia da rotina --------------------------------------------
# A rotina roda como service_role (o job diario). A primeira rodada repoe o
# retrato que o caso (g) apagou de proposito; a segunda, no MESMO dia, e a
# prova de idempotencia: 1 linha por mes, nunca duas.
service_session="SET ROLE service_role;"
primeira="$(psql_q "$service_session SELECT public.talkx_refresh_segment_library_history(8)")"
[[ "$primeira" == '8' ]] || fail "(k) a rotina deveria processar 8 meses [obtido: $primeira]"
antes="$(psql_q 'SELECT count(*) FROM public.talkx_segment_library_history')"
[[ "$antes" == '8' ]] || fail "(k) a rotina deveria repor as 8 linhas do retrato [obtido: $antes]"
segunda="$(psql_q "$service_session SELECT public.talkx_refresh_segment_library_history(8)")"
depois="$(psql_q 'SELECT count(*) FROM public.talkx_segment_library_history')"
no_mes="$(psql_q "SELECT count(*) FROM public.talkx_segment_library_history
  WHERE counted_on >= (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp))::date
    AND counted_on <  (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) + interval '1 month')::date")"
[[ "$segunda" == '8' && "$antes" == "$depois" && "$no_mes" == '1' ]] \
  || fail "(k) a segunda rodada no mesmo dia deveria manter 1 linha por mes [$antes -> $depois, mes: $no_mes]"
case_done idempotencia
pass '(k) rodar a rotina duas vezes no dia mantem 1 linha por mes (ON CONFLICT DO UPDATE)'

# --- (k) a rotina de escrita e negada ao authenticated ---------------------
err_refresh="$(psql_err "SET ROLE authenticated; SELECT public.talkx_refresh_segment_library_history(8)")"
printf '%s' "$err_refresh" | grep -qi 'permission denied' \
  || fail "(k) authenticated conseguiu executar a rotina de escrita [saida: $err_refresh]"
case_done rotina_negada_authenticated
pass '(k) authenticated recebe permission denied na rotina de escrita'

# --- (l) entrada invalida --------------------------------------------------
for caso in '0' '37' 'NULL'; do
  err="$(psql_err "$service_session SELECT public.talkx_refresh_segment_library_history($caso)")"
  printf '%s' "$err" | grep -qi 'p_months precisa estar entre 1 e 36' \
    || fail "(l) p_months=$caso deveria estourar [saida: $err]"
done
err="$(psql_err "$service_session SELECT public.talkx_segment_library_month(NULL, 'America/Sao_Paulo')")"
printf '%s' "$err" | grep -qi 'p_month_start e obrigatorio' || fail "(l) p_month_start nulo deveria estourar [saida: $err]"
err="$(psql_err "$service_session SELECT public.talkx_segment_library_month('2026-10-01', 'Fuso/Inexistente')")"
printf '%s' "$err" | grep -qi 'Fuso/Inexistente' || fail "(l) fuso invalido deveria estourar [saida: $err]"
case_done entrada_invalida
pass '(l) entrada invalida (0, 37, null, fuso inexistente) estoura — a funcao nao chuta'

# --- (m) tudo ou nada: falha no meio nao deixa nada gravado ----------------
# A rotina grava 8 meses em UM laco; o gatilho abaixo derruba o 3o upsert
# (mes corrente - 5). Se a rotina nao fosse tudo-ou-nada, os 2 primeiros meses
# teriam ficado com captured_at novo — o hash do retrato inteiro denuncia.
psql_test >/dev/null <<'SQL'
CREATE FUNCTION public._test_atomic_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF date_trunc('month', NEW.counted_on)
     = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) - interval '5 months' THEN
    RAISE EXCEPTION '_test_falha_artificial_no_terceiro_upsert';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER _test_atomic_fail_trigger BEFORE INSERT ON public.talkx_segment_library_history
  FOR EACH ROW EXECUTE FUNCTION public._test_atomic_fail();
SQL
snapshot_antes="$(psql_q "SELECT md5(string_agg(counted_on::text || ':' || total_segments || ':' || active_segments || ':' || captured_at::text, '|' ORDER BY counted_on)) FROM public.talkx_segment_library_history")"
err_atom="$(psql_err "$service_session SELECT public.talkx_refresh_segment_library_history(8)")"
printf '%s' "$err_atom" | grep -qi '_test_falha_artificial_no_terceiro_upsert' \
  || fail "(m) a falha artificial nao disparou [saida: $err_atom]"
snapshot_depois="$(psql_q "SELECT md5(string_agg(counted_on::text || ':' || total_segments || ':' || active_segments || ':' || captured_at::text, '|' ORDER BY counted_on)) FROM public.talkx_segment_library_history")"
[[ "$snapshot_antes" == "$snapshot_depois" ]] \
  || fail '(m) a rotina deixou retrato parcial quando falhou no 3o upsert (tudo ou nada quebrado)'
psql_test >/dev/null <<'SQL'
DROP TRIGGER _test_atomic_fail_trigger ON public.talkx_segment_library_history;
DROP FUNCTION public._test_atomic_fail();
SQL
# sem o gatilho artificial a rotina volta a fechar
volta="$(psql_q "$service_session SELECT public.talkx_refresh_segment_library_history(8)")"
[[ "$volta" == '8' ]] || fail "(m) depois de remover o gatilho artificial a rotina deveria voltar a fechar [obtido: $volta]"
case_done atomicidade
pass '(m) falha no meio da rotina desfaz tudo: o retrato ficou exatamente como estava'

# --- (n) replay da migration ----------------------------------------------
psql_test < "$migration" >/dev/null || fail '(n) a migration nao e replayavel'
[[ "$(psql_q "SELECT count(*) FROM public.talkx_segment_library_history")" == "$depois" ]] \
  || fail '(n) o replay duplicou o retrato'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_segment_library_stats'")" == '1' ]] \
  || fail '(n) o replay duplicou/removeu a RPC'
case_done replay
pass '(n) replay da migration: idempotente, sem duplicar retrato nem funcao'

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done

pass 'X103 (talkx_segment_library_stats): TODOS os casos de aceite medidos'
