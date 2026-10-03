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
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em
# CASES_SEEN e o harness FALHA no fim se algum caso esperado nao tiver rodado.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261002631230_talkx_v4_x072_overview_stats.sql"
postgres_image="${TALKX_OVERVIEW_STATS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

-- RLS espelhando o modulo (20260409000457, 96ecc54a).
ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;

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
GRANT SELECT ON public.profiles, public.talkx_campaigns, public.talkx_recipients TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid), auth.uid(), auth.role()
  TO authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# Aplicacao da X072 + replay
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail 'X072 nao aplicou'
pass '(0) X072 aplicada sobre a assinatura antiga de 2 argumentos'

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
exp_days="$(psql_q "SELECT (((now())::date - (now() - interval '5 days')::date) + 1)")"
ndays="$(psql_q "SELECT jsonb_array_length(public.talkx_overview_stats($win5)->'daily')")"
[[ "$ndays" == "$exp_days" ]] || fail "(b) daily deveria ter $exp_days pontos (um por dia do periodo inclusivo) [obtido: $ndays]"
# cobertura: o dia de cada ponto e exatamente primeiro_dia + indice, sem buraco nem fora de ordem
buracos="$(psql_q "SELECT count(*) FROM jsonb_array_elements(public.talkx_overview_stats($win5)->'daily') WITH ORDINALITY AS t(e, ord)
  WHERE ((e->>'day')::date - (now() - interval '5 days')::date) <> (ord - 1)")"
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
# (j) replay: segunda aplicacao nao falha
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail '(j) X072 nao e replayavel (segunda aplicacao falhou)'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_overview_stats'")" == '1' ]] \
  || fail '(j) replay duplicou/removeu a talkx_overview_stats'
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_overview_stats(timestamptz,timestamptz)') IS NULL")" == 't' ]] \
  || fail '(j) replay ressuscitou a assinatura antiga'
case_done replay
pass '(j) X072 replayavel; 1 funcao viva e assinatura antiga segue removida'

# ---------------------------------------------------------------------------
# AUSENCIA DE MEDICAO CONTA COMO FALHA
# ---------------------------------------------------------------------------
for c in "${CASES_EXPECTED[@]}"; do
  [[ "${CASES_SEEN[$c]:-}" == '1' ]] || fail "caso de aceite NAO executado: $c (ausencia de medicao)"
done
printf 'PASS: %s/%s casos de aceite medidos\n' "${#CASES_EXPECTED[@]}" "${#CASES_EXPECTED[@]}"

printf 'PASS: X072 talkx_overview_stats — status, alcance distinto, series com zero-fill, periodo anterior, filtros, canal, RLS e assinatura\n'
