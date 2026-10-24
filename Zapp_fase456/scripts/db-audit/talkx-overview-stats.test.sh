#!/usr/bin/env bash
# X072 (Fase 6 · Tela 07/01 · banco + testes): corrigir e parametrizar
# talkx_overview_stats (status, alcance, series, periodo anterior). Fecha
# CAP-080 (parte de visao geral/analytics) e CAP-084.
#
# Contrato em PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-optout.test.sh). Aplica a X072 REAL
# (supabase/migrations/20261002631230_talkx_v4_x072_overview_stats.sql) sobre um
# schema minimo com os objetos que a migration toca, e prova TODOS os casos de
# aceite da secao X072:
#   (a) 1 rascunho + 1 agendada + 1 sending (3 sent + 2 delivered, 1 respondeu) +
#       1 concluida no periodo anterior -> current.campaigns_sent=1, active=2,
#       current.sent=5, current.replied=1, previous.campaigns_sent=1;
#   (b) daily com um ponto por dia do periodo, com zero-fill (sent/delivered/replied);
#   (c) mesmo contato em 2 campanhas conta 1 em contacts_reached;
#   (d) p_audience_source='segment' exclui as campanhas de contatos avulsos;
#   (e) filtro de equipe por profiles.department_id;
#   (f) p_channel='email' devolve zeros; 'whatsapp' devolve o normal;
#   (g) base sem periodo anterior devolve previous: null;
#   (h) agente so ve as proprias campanhas (RLS sobre a funcao INVOKER);
#   (i) assinatura antiga de 2 args DROPada (sem ambiguidade 42725) + ACL nova;
#   (j) migration replayavel (segunda aplicacao nao falha).
#
# ESTENDE para a X073 (leitura/conversao/receita/taxa por segmento/funil de 5
# degraus) aplicando a X073 REAL depois da X072:
#   x073_current  -> current.read=2, conversions=1, revenue=100, taxa 20.0,
#                    segment_conversion_rate_pct=0.0 (conversao sem segmento excluida);
#   x073_funnel   -> funil 5/4/2/1/1 (100.0/80.0/40.0/20.0/20.0 % sobre enviadas);
#   x073_daily    -> serie diaria com conversions (soma 1) e zero-fill;
#   x073_previous -> previous com os mesmos campos novos;
#   x073_segment  -> taxa por segmento conta 1/3 (33.3) apos a conversao de segmento;
#   x073_no_data  -> fonte nunca alimentada devolve null (nao 0): conversions/revenue/
#                    read e o 5o degrau do funil;
#   x073_rollback -> as linhas '-- Rollback' restauram o corpo X072.
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em
# CASES_SEEN e o harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261002631230_talkx_v4_x072_overview_stats.sql"
migration_x073="$repo_root/supabase/migrations/20261011000014_talkx_v4_x073_overview_stats_reads_conversions.sql"
postgres_image="${TALKX_OVERVIEW_STATS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="talkx-overview-stats-test-$$"
test_password="talkx_overview_stats_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

# --- registro dos casos (ausencia de medicao = falha) -----------------------
declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  base_current base_previous base_active daily dedup audience_source
  department channel_email channel_whatsapp previous_null rls_agent
  old_signature_dropped replay
  x073_current x073_funnel x073_daily x073_previous x073_segment
  x073_no_data x073_rollback
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
# Schema minimo: os objetos que a X072 referencia. Espelha as colunas reais de
# profiles / talkx_campaigns / talkx_recipients e as policies de RLS do modulo.
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
CREATE ROLE service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  department_id uuid,
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

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT 'ola',
  status text NOT NULL DEFAULT 'draft',
  audience_source text NOT NULL DEFAULT 'contacts',
  created_by uuid REFERENCES public.profiles(id),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  read_at timestamptz,
  segment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

-- X073: conversoes registradas (colunas reais de 20261002691230).
CREATE TABLE public.talkx_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.talkx_recipients(id) ON DELETE SET NULL,
  link_id uuid,
  value numeric(12,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  currency text NOT NULL DEFAULT 'BRL',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS espelhando o modulo (20260409000457, 96ecc54a).
ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY talkx_campaigns_select_own ON public.talkx_campaigns
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY talkx_recipients_select_own ON public.talkx_recipients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talkx_campaigns tc
    WHERE tc.id = campaign_id
      AND (tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
           OR public.is_admin_or_supervisor(auth.uid()))
  ));
CREATE POLICY talkx_conversions_select_own ON public.talkx_conversions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talkx_campaigns tc
    WHERE tc.id = campaign_id
      AND (tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
           OR public.is_admin_or_supervisor(auth.uid()))
  ));

-- Perfis: p1 admin (equipe d1), p2 supervisor, p3 agente (equipe d2).
INSERT INTO public.profiles (id, user_id, department_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

-- Campanhas: A rascunho, B agendada, C sending (periodo atual),
-- D concluida no periodo anterior (fonte 'segment').
INSERT INTO public.talkx_campaigns
  (id, name, status, audience_source, created_by, started_at)
VALUES
  ('50000000-0000-0000-0000-000000000001', 'A rascunho',  'draft',     'contacts', '10000000-0000-0000-0000-000000000001', NULL),
  ('50000000-0000-0000-0000-000000000002', 'B agendada',  'scheduled', 'contacts', '10000000-0000-0000-0000-000000000001', NULL),
  ('50000000-0000-0000-0000-000000000003', 'C em envio',  'sending',   'contacts', '10000000-0000-0000-0000-000000000001', now() - interval '2 days'),
  ('50000000-0000-0000-0000-000000000004', 'D concluida', 'completed', 'segment',  '10000000-0000-0000-0000-000000000001', now() - interval '7 days');

-- Destinatarios de C: 3 sent + 2 delivered, 1 resposta. Contato ct1 tambem
-- aparece em D (prova do dedup de contacts_reached).
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at, replied_at) VALUES
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-0000000000a1', 'sent',      now() - interval '2 days', NULL, NULL),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-0000000000a2', 'sent',      now() - interval '2 days', NULL, NULL),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-0000000000a3', 'sent',      now() - interval '2 days', NULL, NULL),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-0000000000a4', 'delivered', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', NULL),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-0000000000a5', 'delivered', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', now() - interval '2 days' + interval '2 hours');

-- Destinatarios de D (periodo anterior): ct1 (compartilhado com C) + ct6.
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at, delivered_at) VALUES
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-0000000000a1', 'delivered', now() - interval '7 days', now() - interval '7 days' + interval '1 hour'),
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-0000000000a6', 'delivered', now() - interval '7 days', now() - interval '7 days' + interval '1 hour');

-- Estado ANTERIOR simulado: assinatura antiga de 2 argumentos viva (o alvo do DROP).
CREATE FUNCTION public.talkx_overview_stats(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'current',
    jsonb_build_object('campaigns', count(*))
  )
  FROM public.talkx_campaigns
  WHERE created_at >= p_from AND created_at < p_to
$$;
GRANT EXECUTE ON FUNCTION public.talkx_overview_stats(timestamptz, timestamptz) TO authenticated, service_role;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.talkx_campaigns, public.talkx_recipients, public.talkx_conversions TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), auth.uid(), auth.role()
  TO authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# Aplicacao da X072 + replay
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'X072 nao aplicou'
pass '(0) X072 aplicada sobre a assinatura antiga de 2 argumentos'

# X073 recria a MESMA assinatura (6 args) acrescentando read/conversions/revenue,
# taxas de conversao e o funil de 5 degraus. Aplica depois da X072 (usa talkx_analytics_scope).
psql_test < "$migration_x073" >/dev/null || fail 'X073 nao aplicou'
pass '(0) X073 aplicada (recria talkx_overview_stats com leitura/conversao/funil)'

# ---------------------------------------------------------------------------
# (i) assinatura antiga DROPada + ACL
# ---------------------------------------------------------------------------
six='public.talkx_overview_stats(timestamptz,timestamptz,text,uuid,text,text)'
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_overview_stats(timestamptz,timestamptz)') IS NULL")" == 't' ]] \
  || fail '(i) a assinatura antiga de 2 argumentos sobreviveu (ambiguidade 42725)'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_overview_stats'")" == '1' ]] \
  || fail '(i) deveria existir exatamente 1 talkx_overview_stats'
[[ "$(psql_q "SELECT to_regprocedure('$six') IS NOT NULL")" == 't' ]] \
  || fail '(i) a assinatura nova de 6 argumentos nao existe'
[[ "$(psql_q "SELECT has_function_privilege('authenticated','$six','EXECUTE')")" == 't' ]] || fail '(i) authenticated sem EXECUTE na nova'
[[ "$(psql_q "SELECT has_function_privilege('service_role','$six','EXECUTE')")" == 't' ]] || fail '(i) service_role sem EXECUTE na nova'
[[ "$(psql_q "SELECT has_function_privilege('anon','$six','EXECUTE')")" == 'f' ]] || fail '(i) anon com EXECUTE na nova'
[[ "$(psql_q "SELECT has_function_privilege('anon','public.talkx_analytics_scope(text,uuid,text)','EXECUTE')")" == 'f' ]] \
  || fail '(i) anon com EXECUTE na auxiliar'
[[ "$(psql_q "SELECT to_regclass('public.idx_talkx_recipients_sent_at') IS NOT NULL AND to_regclass('public.idx_talkx_recipients_replied_at') IS NOT NULL")" == 't' ]] \
  || fail '(i) indices de sent_at/replied_at ausentes'
case_done old_signature_dropped
pass '(i) assinatura de 2 args removida, nova de 6 args, ACL e indices ok'

# helper: extrai um caminho jsonb (win, formato, 'secao', 'campo')
jget() { psql_q "SELECT public.talkx_overview_stats($1)->$3->>$4"; }

# ---------------------------------------------------------------------------
# (a) numeros-base da especificacao (periodo = ultimos 5 dias)
# ---------------------------------------------------------------------------
win5="now() - interval '5 days', now()"

cs="$(${FUNC:-jget} "$win5" text "'current'" "'campaigns_sent'")"
[[ "$cs" == '1' ]] || fail "(a) current.campaigns_sent esperado 1 [obtido: $cs]"
sent="$(${FUNC:-jget} "$win5" text "'current'" "'sent'")"
[[ "$sent" == '5' ]] || fail "(a) current.sent esperado 5 [obtido: $sent]"
deliv="$(${FUNC:-jget} "$win5" text "'current'" "'delivered'")"
[[ "$deliv" == '2' ]] || fail "(a) current.delivered esperado 2 [obtido: $deliv]"
repl="$(${FUNC:-jget} "$win5" text "'current'" "'replied'")"
[[ "$repl" == '1' ]] || fail "(a) current.replied esperado 1 [obtido: $repl]"
reached="$(${FUNC:-jget} "$win5" text "'current'" "'contacts_reached'")"
[[ "$reached" == '5' ]] || fail "(a) current.contacts_reached esperado 5 [obtido: $reached]"
dr="$(${FUNC:-jget} "$win5" text "'current'" "'delivery_rate_pct'")"
[[ "$dr" == '40.0' ]] || fail "(a) current.delivery_rate_pct esperado 40.0 [obtido: $dr]"
rr="$(${FUNC:-jget} "$win5" text "'current'" "'reply_rate_pct'")"
[[ "$rr" == '20.0' ]] || fail "(a) current.reply_rate_pct esperado 20.0 [obtido: $rr]"
case_done base_current
pass '(a) current: campaigns_sent=1, sent=5, delivered=2, replied=1, contacts_reached=5, taxas 40.0/20.0'

pcs="$(${FUNC:-jget} "$win5" text "'previous'" "'campaigns_sent'")"
[[ "$pcs" == '1' ]] || fail "(a) previous.campaigns_sent esperado 1 [obtido: $pcs]"
psent="$(${FUNC:-jget} "$win5" text "'previous'" "'sent'")"
[[ "$psent" == '2' ]] || fail "(a) previous.sent esperado 2 [obtido: $psent]"
preach="$(${FUNC:-jget} "$win5" text "'previous'" "'contacts_reached'")"
[[ "$preach" == '2' ]] || fail "(a) previous.contacts_reached esperado 2 [obtido: $preach]"
case_done base_previous
pass '(a) previous: campaigns_sent=1, sent=2, contacts_reached=2 (mesmos campos do current)'

act_curr="$(${FUNC:-jget} "$win5" text "'current'" "'active'")"
act_top="$(psql_q "SELECT public.talkx_overview_stats($win5)->>'active'")"
[[ "$act_curr" == '2' && "$act_top" == '2' ]] \
  || fail "(a) active esperado 2 [current.active=$act_curr | top=$act_top]"
case_done base_active
pass '(a) active=2 (scheduled + sending), sem recorte de periodo'

# ---------------------------------------------------------------------------
# (b) daily: um ponto por dia, com zero-fill
# ---------------------------------------------------------------------------
# O periodo vai de (now() - 5 dias) ate now(), intervalo INCLUSIVO: sao 6 datas.
# A expectativa e DERIVADA do periodo, nao fixada em numero magico.
# A funcao bucketiza 'day' em p_timezone (default America/Sao_Paulo, nao passado
# aqui), nao no fuso da sessao do teste (UTC no container descartavel). Entre
# 00h-03h UTC a data civil em Sao Paulo ainda e "ontem": sem AT TIME ZONE aqui,
# a data de referencia do teste fica um dia na frente da bucketizacao real da
# funcao e TODOS os pontos da serie aparentam "buraco" (achado na PR #1963).
exp_days="$(psql_q "SELECT ((((now()) AT TIME ZONE 'America/Sao_Paulo')::date - ((now() - interval '5 days') AT TIME ZONE 'America/Sao_Paulo')::date) + 1)")"
ndays="$(psql_q "SELECT jsonb_array_length(public.talkx_overview_stats($win5)->'daily')")"
[[ "$ndays" == "$exp_days" ]] || fail "(b) daily deveria ter $exp_days pontos (um por dia do periodo inclusivo) [obtido: $ndays]"
# cobertura: o dia de cada ponto e exatamente primeiro_dia + indice, sem buraco nem fora de ordem
buracos="$(psql_q "SELECT count(*) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') WITH ORDINALITY AS t(e, ord)
  WHERE ((e->>'day')::date - ((now() - interval '5 days') AT TIME ZONE 'America/Sao_Paulo')::date) <> (ord - 1)")"
[[ "$buracos" == '0' ]] || fail "(b) serie diaria com buraco ou fora de ordem [divergencias: $buracos]"
allfields="$(psql_q "SELECT count(*) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') e
  WHERE (e->>'sent') IS NOT NULL AND (e->>'delivered') IS NOT NULL AND (e->>'replied') IS NOT NULL")"
[[ "$allfields" == "$exp_days" ]] || fail "(b) ponto de daily sem os tres campos [obtido: $allfields de $exp_days]"
dsum="$(psql_q "SELECT sum((e->>'sent')::int) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') e")"
[[ "$dsum" == '5' ]] || fail "(b) soma de sent na serie diaria esperada 5 [obtido: $dsum]"
ddsum="$(psql_q "SELECT sum((e->>'delivered')::int) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') e")"
[[ "$ddsum" == '2' ]] || fail "(b) soma de delivered na serie diaria esperada 2 [obtido: $ddsum]"
drsum="$(psql_q "SELECT sum((e->>'replied')::int) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') e")"
[[ "$drsum" == '1' ]] || fail "(b) soma de replied na serie diaria esperada 1 [obtido: $drsum]"
zeros="$(psql_q "SELECT count(*) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') e WHERE (e->>'sent')::int = 0")"
com_envio="$(psql_q "SELECT count(*) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') e WHERE (e->>'sent')::int > 0")"
exp_zeros="$(( exp_days - com_envio ))"
[[ "$zeros" == "$exp_zeros" ]] || fail "(b) zero-fill ausente (esperava $exp_zeros dias sem envio de $exp_days) [obtido: $zeros]"
case_done daily
pass "(b) daily com $exp_days pontos (um por dia do periodo), zero-fill em $exp_zeros, somas 5/2/1"

# ---------------------------------------------------------------------------
# (c) mesmo contato em 2 campanhas conta 1 em contacts_reached
# ---------------------------------------------------------------------------
win10="now() - interval '10 days', now()"
wide_reached="$(${FUNC:-jget} "$win10" text "'current'" "'contacts_reached'")"
wide_sent="$(${FUNC:-jget} "$win10" text "'current'" "'sent'")"
[[ "$wide_sent" == '7' ]] || fail "(c) janela ampla: sent esperado 7 [obtido: $wide_sent]"
[[ "$wide_reached" == '6' ]] || fail "(c) janela ampla: contacts_reached esperado 6 (ct1 uma vez) [obtido: $wide_reached]"
case_done dedup
pass '(c) 7 envios em 2 campanhas = 6 contatos distintos (contato repetido conta 1)'

# ---------------------------------------------------------------------------
# (d) p_audience_source='segment' exclui contatos avulsos; 'contacts' isola-os
# ---------------------------------------------------------------------------
seg_reached="$(psql_q "SELECT public.talkx_overview_stats($win10, 'segment')->'current'->>'contacts_reached'")"
seg_sent="$(psql_q "SELECT public.talkx_overview_stats($win10, 'segment')->'current'->>'sent'")"
con_reached="$(psql_q "SELECT public.talkx_overview_stats($win10, 'contacts')->'current'->>'contacts_reached'")"
con_sent="$(psql_q "SELECT public.talkx_overview_stats($win10, 'contacts')->'current'->>'sent'")"
[[ "$seg_reached" == '2' && "$seg_sent" == '2' ]] \
  || fail "(d) segment: reached/sent esperados 2/2 [obtido: $seg_reached/$seg_sent]"
[[ "$con_reached" == '5' && "$con_sent" == '5' ]] \
  || fail "(d) contacts: reached/sent esperados 5/5 [obtido: $con_reached/$con_sent]"
case_done audience_source
pass "(d) audience_source='segment' isola o publico de segmento (2/2); 'contacts' exclui os avulsos (5/5)"

# ---------------------------------------------------------------------------
# (f) canal: 'email' devolve zeros; 'whatsapp' mantem os numeros
# ---------------------------------------------------------------------------
ch_sent="$(psql_q "SELECT public.talkx_overview_stats($win5, NULL, NULL, 'email')->'current'->>'sent'")"
ch_reached="$(psql_q "SELECT public.talkx_overview_stats($win5, NULL, NULL, 'email')->'current'->>'contacts_reached'")"
ch_active="$(psql_q "SELECT public.talkx_overview_stats($win5, NULL, NULL, 'email')->>'active'")"
ch_daily="$(psql_q "SELECT coalesce(sum((e->>'sent')::int),0) FROM jsonb_array_elements(public.talkx_overview_stats($win5, NULL, NULL, 'email')->'daily') e")"
[[ "$ch_sent" == '0' && "$ch_reached" == '0' && "$ch_active" == '0' && "$ch_daily" == '0' ]] \
  || fail "(f) p_channel='email' deveria devolver zeros [sent=$ch_sent reached=$ch_reached active=$ch_active daily=$ch_daily]"
case_done channel_email
pass "(f) p_channel='email' devolve zeros (sent/reached/active/daily)"
wa_sent="$(psql_q "SELECT public.talkx_overview_stats($win5, NULL, NULL, 'whatsapp')->'current'->>'sent'")"
[[ "$wa_sent" == '5' ]] || fail "(f) p_channel='whatsapp' deveria manter sent=5 [obtido: $wa_sent]"
case_done channel_whatsapp
pass "(f) p_channel='whatsapp' mantem os numeros (sent=5)"

# ---------------------------------------------------------------------------
# (g) base sem periodo anterior -> previous: null
# ---------------------------------------------------------------------------
win3="now() - interval '3 days', now()"
prev_kind="$(psql_q "SELECT jsonb_typeof(public.talkx_overview_stats($win3)->'previous')")"
[[ "$prev_kind" == 'null' ]] || fail "(g) previous deveria ser null sem campanha no periodo anterior [obtido: $prev_kind]"
c3="$(psql_q "SELECT public.talkx_overview_stats($win3)->'current'->>'campaigns_sent'")"
[[ "$c3" == '1' ]] || fail "(g) current.campaigns_sent esperado 1 na janela curta [obtido: $c3]"
case_done previous_null
pass '(g) periodo anterior sem campanha iniciada => previous: null'

# ---------------------------------------------------------------------------
# campanha do agente (para RLS e filtro de equipe) — inserida depois das
# medicoes base para nao alterar os numeros ja provados.
# ---------------------------------------------------------------------------
psql_q "INSERT INTO public.talkx_campaigns (id, name, status, audience_source, created_by, started_at)
        VALUES ('50000000-0000-0000-0000-000000000005','E agente','sending','contacts','10000000-0000-0000-0000-000000000003', now() - interval '1 day')" >/dev/null
psql_q "INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at) VALUES
        ('50000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-0000000000b1','sent', now() - interval '1 day'),
        ('50000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-0000000000b2','sent', now() - interval '1 day')" >/dev/null

# ---------------------------------------------------------------------------
# (e) filtro de equipe (profiles.department_id)
# ---------------------------------------------------------------------------
d1_sent="$(psql_q "SELECT public.talkx_overview_stats($win5, NULL, '40000000-0000-0000-0000-000000000001')->'current'->>'sent'")"
d2_sent="$(psql_q "SELECT public.talkx_overview_stats($win5, NULL, '40000000-0000-0000-0000-000000000002')->'current'->>'sent'")"
[[ "$d1_sent" == '5' ]] || fail "(e) equipe do admin deveria somar 5 envios [obtido: $d1_sent]"
[[ "$d2_sent" == '2' ]] || fail "(e) equipe do agente deveria somar 2 envios [obtido: $d2_sent]"
case_done department
pass '(e) filtro de equipe via profiles.department_id separa as campanhas (5 x 2)'

# ---------------------------------------------------------------------------
# (h) RLS: agente so ve as proprias campanhas
# ---------------------------------------------------------------------------
agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"

ag_sent="$(psql_q "$agent_session SELECT public.talkx_overview_stats($win5)->'current'->>'sent'")"
ag_camp="$(psql_q "$agent_session SELECT public.talkx_overview_stats($win5)->'current'->>'campaigns_sent'")"
ag_reach="$(psql_q "$agent_session SELECT public.talkx_overview_stats($win5)->'current'->>'contacts_reached'")"
ag_active="$(psql_q "$agent_session SELECT public.talkx_overview_stats($win5)->>'active'")"
[[ "$ag_sent" == '2' ]] || fail "(h) agente deveria ver 2 envios (so a propria) [obtido: $ag_sent]"
[[ "$ag_camp" == '1' ]] || fail "(h) agente deveria ver 1 campanha propria [obtido: $ag_camp]"
[[ "$ag_reach" == '2' ]] || fail "(h) agente deveria ver 2 contatos alcancados [obtido: $ag_reach]"
[[ "$ag_active" == '1' ]] || fail "(h) agente deveria ver 1 campanha ativa propria [obtido: $ag_active]"

ad_sent="$(psql_q "$admin_session SELECT public.talkx_overview_stats($win5)->'current'->>'sent'")"
ad_camp="$(psql_q "$admin_session SELECT public.talkx_overview_stats($win5)->'current'->>'campaigns_sent'")"
[[ "$ad_sent" == '7' && "$ad_camp" == '2' ]] \
  || fail "(h) admin/supervisor deveria ver tudo (sent=7, campaigns=2) [obtido: $ad_sent/$ad_camp]"
case_done rls_agent
pass '(h) RLS: agente ve so as proprias (sent=2); admin ve todas (sent=7)'

# ---------------------------------------------------------------------------
# X073: leitura (read), conversoes, receita, taxa por segmento e funil de 5 degraus
# ---------------------------------------------------------------------------
# Fixture (completa o cenario do cartao sobre a campanha C ja existente):
#   5 enviadas (a1..a5), 4 entregues (a2,a3 passam a entregues; a4,a5 ja eram),
#   2 lidas (a4,a5), 1 resposta (a5), 1 conversao de R$100 de a4.
#   a1..a3 TEM segmento; a4,a5 NAO tem. A conversao e de a4 (sem segmento) e por
#   isso NAO pode entrar na taxa por segmento.
psql_q "UPDATE public.talkx_recipients SET delivered_at = now() - interval '2 days' + interval '1 hour'
        WHERE campaign_id = '50000000-0000-0000-0000-000000000003'
          AND contact_id IN ('30000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000a3')" >/dev/null
psql_q "UPDATE public.talkx_recipients SET read_at = now() - interval '2 days' + interval '3 hours'
        WHERE campaign_id = '50000000-0000-0000-0000-000000000003'
          AND contact_id IN ('30000000-0000-0000-0000-0000000000a4','30000000-0000-0000-0000-0000000000a5')" >/dev/null
psql_q "UPDATE public.talkx_recipients SET segment_id = '60000000-0000-0000-0000-0000000000c1'
        WHERE campaign_id = '50000000-0000-0000-0000-000000000003'
          AND contact_id IN ('30000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000a3')" >/dev/null
psql_q "INSERT INTO public.talkx_conversions (campaign_id, recipient_id, value, source, occurred_at)
        SELECT '50000000-0000-0000-0000-000000000003', r.id, 100.00, 'manual', now() - interval '2 days'
        FROM public.talkx_recipients r
        WHERE r.campaign_id = '50000000-0000-0000-0000-000000000003'
          AND r.contact_id = '30000000-0000-0000-0000-0000000000a4'" >/dev/null

# Escopo dos casos X073: a campanha C (equipe d1, 5 enviadas). A janela win5 sem
# filtro soma 7 (entra a campanha E do agente, 'contacts'), por isso o cartao — 
# 5/4/2/1/1 — e medido sobre a equipe d1 (so a campanha C).
win5x="now() - interval '5 days', now(), NULL, '40000000-0000-0000-0000-000000000001'"

x_sent="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'sent'")"
x_deliv="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'delivered'")"
x_read="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'read'")"
x_conv="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'conversions'")"
x_rev="$(psql_q "SELECT (public.talkx_overview_stats($win5x)->'current'->>'revenue')::numeric = 100.00")"
x_rate="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'conversion_rate_pct'")"
x_seg="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'segment_conversion_rate_pct'")"
[[ "$x_sent" == '5' ]] || fail "X073 current.sent esperado 5 [obtido: $x_sent]"
[[ "$x_deliv" == '4' ]] || fail "X073 current.delivered esperado 4 [obtido: $x_deliv]"
[[ "$x_read" == '2' ]] || fail "X073 current.read esperado 2 [obtido: $x_read]"
[[ "$x_conv" == '1' ]] || fail "X073 current.conversions esperado 1 [obtido: $x_conv]"
[[ "$x_rev" == 't' ]] || fail "X073 current.revenue esperado 100,00 [obtido: $x_rev]"
[[ "$x_rate" == '20.0' ]] || fail "X073 conversion_rate_pct esperado 20.0 [obtido: $x_rate]"
[[ "$x_seg" == '0.0' ]] || fail "X073 segment_conversion_rate_pct esperado 0.0 (conversao de destinatario SEM segmento nao entra) [obtido: $x_seg]"
case_done x073_current
pass '(X073) current: sent=5, read=2, conversions=1, revenue=100, taxa 20.0, taxa-segmento 0.0 (sem segmento excluido)'

# funil de 5 degraus: sent/delivered/read/replied/conversions = 5/4/2/1/1 (100/80/40/20/20 %)
f_len="$(psql_q "SELECT jsonb_array_length(public.talkx_overview_stats($win5x)->'current'->'funnel')")"
f_steps="$(psql_q "SELECT string_agg(e->>'step', ',' ORDER BY ord) FROM jsonb_array_elements(public.talkx_overview_stats($win5x)->'current'->'funnel') WITH ORDINALITY AS t(e,ord)")"
f_counts="$(psql_q "SELECT string_agg(e->>'count', ',' ORDER BY ord) FROM jsonb_array_elements(public.talkx_overview_stats($win5x)->'current'->'funnel') WITH ORDINALITY AS t(e,ord)")"
f_pcts="$(psql_q "SELECT string_agg(e->>'pct', ',' ORDER BY ord) FROM jsonb_array_elements(public.talkx_overview_stats($win5x)->'current'->'funnel') WITH ORDINALITY AS t(e,ord)")"
[[ "$f_len" == '5' ]] || fail "X073 funil deveria ter 5 degraus [obtido: $f_len]"
[[ "$f_steps" == 'sent,delivered,read,replied,conversions' ]] || fail "X073 ordem dos degraus do funil errada [obtido: $f_steps]"
[[ "$f_counts" == '5,4,2,1,1' ]] || fail "X073 contagem do funil esperada 5,4,2,1,1 [obtido: $f_counts]"
[[ "$f_pcts" == '100.0,80.0,40.0,20.0,20.0' ]] || fail "X073 percentuais do funil esperados 100.0/80.0/40.0/20.0/20.0 [obtido: $f_pcts]"
case_done x073_funnel
pass '(X073) funil 5 degraus: 5/4/2/1/1 e 100.0/80.0/40.0/20.0/20.0 % sobre enviadas'

# daily ganha conversions (com zero-fill como os demais campos)
xd_sum="$(psql_q "SELECT sum((e->>'conversions')::int) FROM jsonb_array_elements(public.talkx_overview_stats($win5x)->'daily') e")"
xd_all="$(psql_q "SELECT count(*) FROM jsonb_array_elements(public.talkx_overview_stats($win5x)->'daily') e WHERE (e->>'conversions') IS NOT NULL")"
[[ "$xd_sum" == '1' ]] || fail "X073 soma de conversions na serie diaria esperada 1 [obtido: $xd_sum]"
[[ "$xd_all" == "$exp_days" ]] || fail "X073 daily sem o campo conversions em todos os $exp_days pontos [obtido: $xd_all]"
case_done x073_daily
pass '(X073) daily com conversions (soma 1) e zero-fill em todos os pontos'

# previous recebe os MESMOS campos novos
xp_keys="$(psql_q "SELECT (s->'previous') ? 'read' AND (s->'previous') ? 'conversions' AND (s->'previous') ? 'revenue' AND (s->'previous') ? 'funnel' FROM (SELECT public.talkx_overview_stats($win5x) AS s) q")"
xp_len="$(psql_q "SELECT jsonb_array_length(public.talkx_overview_stats($win5x)->'previous'->'funnel')")"
[[ "$xp_keys" == 't' ]] || fail "X073 previous sem os campos novos (read/conversions/revenue/funnel)"
[[ "$xp_len" == '5' ]] || fail "X073 funil do previous deveria ter 5 degraus [obtido: $xp_len]"
case_done x073_previous
pass '(X073) previous carrega os mesmos campos novos (read/conversions/revenue/funnel)'

# taxa por segmento CONTA a conversao de destinatario COM segmento (nao e sempre 0)
psql_q "INSERT INTO public.talkx_conversions (campaign_id, recipient_id, value, source, occurred_at)
        SELECT '50000000-0000-0000-0000-000000000003', r.id, 30.00, 'manual', now() - interval '2 days'
        FROM public.talkx_recipients r
        WHERE r.campaign_id = '50000000-0000-0000-0000-000000000003'
          AND r.contact_id = '30000000-0000-0000-0000-0000000000a1'" >/dev/null
x_seg2="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'segment_conversion_rate_pct'")"
x_conv2="$(psql_q "SELECT public.talkx_overview_stats($win5x)->'current'->>'conversions'")"
[[ "$x_seg2" == '33.3' ]] || fail "X073 segment_conversion_rate_pct com 1/3 conversoes de segmento esperado 33.3 [obtido: $x_seg2]"
[[ "$x_conv2" == '2' ]] || fail "X073 conversions apos a 2a conversao esperado 2 [obtido: $x_conv2]"
case_done x073_segment
pass '(X073) taxa por segmento: exclui conversao sem segmento (0.0) e conta a com segmento (33.3)'

# fonte sem nenhum dado no escopo -> campo null (nao 0). Escopo: equipe do agente
# (campanha E), que nunca teve leitura nem conversao.
d2='40000000-0000-0000-0000-000000000002'
nd_sent="$(psql_q "SELECT public.talkx_overview_stats($win5, NULL, '$d2')->'current'->>'sent'")"
nd_conv="$(psql_q "SELECT jsonb_typeof(public.talkx_overview_stats($win5, NULL, '$d2')->'current'->'conversions')")"
nd_rev="$(psql_q "SELECT jsonb_typeof(public.talkx_overview_stats($win5, NULL, '$d2')->'current'->'revenue')")"
nd_read="$(psql_q "SELECT jsonb_typeof(public.talkx_overview_stats($win5, NULL, '$d2')->'current'->'read')")"
nd_step5="$(psql_q "SELECT jsonb_typeof(e->'count') FROM jsonb_array_elements(public.talkx_overview_stats($win5, NULL, '$d2')->'current'->'funnel') WITH ORDINALITY AS t(e,ord) WHERE ord = 5")"
[[ "$nd_sent" == '2' ]] || fail "X073 base sem dados: sent esperado 2 [obtido: $nd_sent]"
[[ "$nd_conv" == 'null' ]] || fail "X073 base sem conversao: conversions deveria ser null (nao 0) [obtido: $nd_conv]"
[[ "$nd_rev" == 'null' ]] || fail "X073 base sem conversao: revenue deveria ser null [obtido: $nd_rev]"
[[ "$nd_read" == 'null' ]] || fail "X073 base sem leitura: read deveria ser null [obtido: $nd_read]"
[[ "$nd_step5" == 'null' ]] || fail "X073 base sem conversao: 5o degrau do funil deveria ser null [obtido: $nd_step5]"
case_done x073_no_data
pass '(X073) campo cuja fonte nunca recebeu dado vem null: conversions/revenue/read e o 5o degrau do funil'

# rollback de verdade: as linhas "-- Rollback (SQL ...)" recriam o corpo X072
rb_sql="$(awk '/^-- Rollback \(SQL/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' "$migration_x073")"
printf '%s\n' "$rb_sql" | psql_test >/dev/null || fail 'X073 rollback nao executou'
rb_read="$(psql_q "SELECT (public.talkx_overview_stats($win5x)->'current') ? 'read'")"
rb_funnel="$(psql_q "SELECT (public.talkx_overview_stats($win5x)->'current') ? 'funnel'")"
rb_six="$(psql_q "SELECT to_regprocedure('$six') IS NOT NULL")"
[[ "$rb_read" == 'f' && "$rb_funnel" == 'f' ]] \
  || fail "X073 rollback nao restaurou o corpo X072 [read=$rb_read funnel=$rb_funnel]"
[[ "$rb_six" == 't' ]] || fail 'X073 rollback removeu a funcao de 6 argumentos'
case_done x073_rollback
pass '(X073) rollback executavel restaura o corpo X072 sem perder a assinatura de 6 args'

# ---------------------------------------------------------------------------
# (j) replay: segunda aplicacao nao falha
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail '(j) X072 nao e replayavel (segunda aplicacao falhou)'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_overview_stats'")" == '1' ]] \
  || fail '(j) replay duplicou/removeu a talkx_overview_stats'
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_overview_stats(timestamptz,timestamptz)') IS NULL")" == 't' ]] \
  || fail '(j) replay ressuscitou a assinatura antiga'
psql_test < "$migration_x073" >/dev/null || fail '(j) X073 nao e replayavel (segunda aplicacao falhou)'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_overview_stats'")" == '1' ]] \
  || fail '(j) replay da X073 duplicou/removeu a talkx_overview_stats'
case_done replay
pass '(j) X072 e X073 replayaveis; 1 funcao viva e assinatura antiga segue removida'

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done
printf 'PASS: %s/%s casos de aceite medidos\n' "${#CASES_EXPECTED[@]}" "${#CASES_EXPECTED[@]}"

printf 'PASS: X072 talkx_overview_stats — status, alcance distinto, series com zero-fill, periodo anterior, filtros, canal, RLS e assinatura\n'
