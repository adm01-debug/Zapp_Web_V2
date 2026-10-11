#!/usr/bin/env bash
# X140 (Fase 11 · banco + testes): talkx_monitor_panel — KPIs, comparativo com ontem,
# serie por minuto com zeros, saude do worker e autorizacao.
#
# Aplica a migration REAL (supabase/migrations/20261010060000_talkx_monitor_panel.sql) num
# PostgreSQL 17 descartavel e chama a funcao com papel real (SET ROLE authenticated + claims).
# Vermelho→verde: com TALKX_MONITOR_PANEL_RED=1 a migration NAO e aplicada e o harness tem
# de falhar (o estado da base, sem a funcao).
#
# AUSENCIA DE MEDICAO CONTA COMO FALHA: cada caso registra sua execucao em CASES_SEEN.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010060000_talkx_monitor_panel.sql"
postgres_image="${TALKX_MONITOR_PANEL_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-monitor-panel-test-$$"
test_password="talkx_monitor_panel_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

declare -A CASES_SEEN=()
declare -a CASES_EXPECTED=(
  series_total series_delivered_minute kpis stalled high_failure vs_yesterday_null
  vs_yesterday_value empty_campaign hour_bucket segment_filter failed_at_trigger
  owner_ok admin_ok other_agent_denied missing_campaign_denied anon_denied
  no_profile_denied null_owner_denied
  invalid_args acl replay backfill_preserves_updated_at
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
# Schema minimo: so as colunas que a funcao le, com as mesmas RLS/papeis do modulo.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
$$;
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected'
);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  schedule_timezone text,
  pause_reason text,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_max integer NOT NULL DEFAULT 15000,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL DEFAULT gen_random_uuid(),
  segment_id uuid,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  delivery_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE SET NULL,
  origin text NOT NULL DEFAULT 'manual'
);
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;
CREATE TRIGGER update_talkx_recipients_updated_at
  BEFORE UPDATE ON public.talkx_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Perfis: p1 admin, p2 dono das campanhas, p3 outro agente.
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES ('20000000-0000-0000-0000-000000000001', 'admin');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

-- Minuto de referencia: as sementes caem sempre dentro de um minuto fechado, nunca na fronteira.
CREATE FUNCTION public.m(n integer) RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT date_trunc('minute', now()) - make_interval(mins => n) + interval '10 seconds'
$$;

-- Ontem ao meio-dia no fuso da campanha (o fuso padrao da funcao e America/Sao_Paulo).
CREATE FUNCTION public.yday_noon() RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '12 hours')
         AT TIME ZONE 'America/Sao_Paulo'
$$;

-- A: 12 destinatarios enviados em 3 minutos distintos (4 em -3, -5 e -7 min);
--    entrega 2 min depois do envio; 2 respostas; sem envio ontem.
INSERT INTO public.talkx_campaigns (id, status, created_by, started_at, updated_at) VALUES
  ('50000000-0000-0000-0000-00000000000a', 'sending', '10000000-0000-0000-0000-000000000002',
   now() - interval '1 hour', now() - interval '1 hour');
INSERT INTO public.talkx_recipients (campaign_id, segment_id, status, sent_at, delivered_at, replied_at)
SELECT '50000000-0000-0000-0000-00000000000a',
       CASE WHEN g <= 4 THEN '60000000-0000-0000-0000-000000000001'::uuid END,
       'delivered',
       public.m((ARRAY[3,5,7])[(g - 1) / 4 + 1]),
       public.m((ARRAY[3,5,7])[(g - 1) / 4 + 1] - 2),
       CASE WHEN g IN (1, 5) THEN public.m((ARRAY[3,5,7])[(g - 1) / 4 + 1] - 2) END
  FROM generate_series(1, 12) g;
INSERT INTO public.talkx_blacklist (campaign_id, origin) VALUES
  ('50000000-0000-0000-0000-00000000000a', 'optout'),
  ('50000000-0000-0000-0000-00000000000a', 'manual');

-- B: sending, 3 pendentes, ultimo envio ha 20 min -> stalled.
INSERT INTO public.talkx_campaigns (id, status, created_by, started_at, updated_at) VALUES
  ('50000000-0000-0000-0000-00000000000b', 'sending', '10000000-0000-0000-0000-000000000002',
   now() - interval '2 hours', now() - interval '2 hours');
INSERT INTO public.talkx_recipients (campaign_id, status, sent_at) VALUES
  ('50000000-0000-0000-0000-00000000000b', 'sent', public.m(20)),
  ('50000000-0000-0000-0000-00000000000b', 'pending', NULL),
  ('50000000-0000-0000-0000-00000000000b', 'pending', NULL),
  ('50000000-0000-0000-0000-00000000000b', 'pending', NULL);

-- C: 60 processados, 6 falhas (10%) -> high_failure. Envios recentes (entrega ainda nao conta).
INSERT INTO public.talkx_campaigns (id, status, created_by, started_at, updated_at) VALUES
  ('50000000-0000-0000-0000-00000000000c', 'sending', '10000000-0000-0000-0000-000000000002',
   now() - interval '1 hour', now() - interval '1 hour');
INSERT INTO public.talkx_recipients (campaign_id, status, sent_at, delivered_at)
SELECT '50000000-0000-0000-0000-00000000000c', 'delivered', public.m(2), public.m(1) FROM generate_series(1, 54);
INSERT INTO public.talkx_recipients (campaign_id, status) -- falha entra pelo INSERT (trigger)
SELECT '50000000-0000-0000-0000-00000000000c', 'failed' FROM generate_series(1, 6);

-- D: com envio ontem (3 envios, 1 resposta ontem) e hoje 2 respostas; pausada por motivo automatico.
INSERT INTO public.talkx_campaigns (id, status, pause_reason, created_by, started_at, updated_at) VALUES
  ('50000000-0000-0000-0000-00000000000d', 'paused', 'outside_send_window',
   '10000000-0000-0000-0000-000000000002', now() - interval '3 days', now() - interval '3 days');
INSERT INTO public.talkx_recipients (campaign_id, status, sent_at, delivered_at, replied_at) VALUES
  ('50000000-0000-0000-0000-00000000000d', 'delivered', public.yday_noon(), NULL, public.yday_noon() + interval '1 hour'),
  ('50000000-0000-0000-0000-00000000000d', 'delivered', public.yday_noon(), NULL, NULL),
  ('50000000-0000-0000-0000-00000000000d', 'delivered', public.yday_noon(), NULL, NULL),
  ('50000000-0000-0000-0000-00000000000d', 'delivered', public.m(4), NULL, now() - interval '2 seconds'),
  ('50000000-0000-0000-0000-00000000000d', 'delivered', public.m(4), NULL, now() - interval '1 second');

-- E: campanha vazia, concluida.
INSERT INTO public.talkx_campaigns (id, status, created_by) VALUES
  ('50000000-0000-0000-0000-00000000000e', 'completed', '10000000-0000-0000-0000-000000000002');

-- F: campanha sem dono (created_by NULL): so admin/supervisor pode ler.
INSERT INTO public.talkx_campaigns (id, status, created_by) VALUES
  ('50000000-0000-0000-0000-00000000000f', 'sending', NULL);

-- G: falha antiga para provar que o backfill de failed_at nao regrava updated_at.
INSERT INTO public.talkx_campaigns (id, status, created_by) VALUES
  ('50000000-0000-0000-0000-0000000000aa', 'completed', '10000000-0000-0000-0000-000000000002');
INSERT INTO public.talkx_recipients (id, campaign_id, status, updated_at) VALUES
  ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000aa', 'failed',
   timestamptz '2024-01-02 03:04:05+00');
SQL

if [[ "${TALKX_MONITOR_PANEL_RED:-0}" != '1' ]]; then
  psql_test < "$migration" >/dev/null || fail 'migration do monitor nao aplicou'
  pass '(0) migration aplicada'
else
  printf 'INFO: modo RED — migration NAO aplicada (estado da base)\n'
fi

owner="SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';"
other="SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003';"
admin="SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"
camp() { printf '50000000-0000-0000-0000-00000000000%s' "$1"; }
panel() { # <sessao> <campanha letra> [args extras]
  psql_q "$1 SELECT public.talkx_monitor_panel('$(camp "$2")'${3:+, $3})"
}
expect() { # <rotulo> <obtido> <esperado>
  [[ "$2" == "$3" ]] || fail "$1 [esperado: $3 | obtido: $2]"
}

expect 'backfill preserva updated_at da falha existente' "$(psql_q "SELECT updated_at = timestamptz '2024-01-02 03:04:05+00' AND failed_at = timestamptz '2024-01-02 03:04:05+00' FROM public.talkx_recipients WHERE id = '70000000-0000-0000-0000-000000000001'")" 't'
case_done backfill_preserves_updated_at

# --- (1) serie de 15 min: 15 pontos, soma 12, entrega no minuto do delivered_at ----
res="$(panel "$owner" a "15, 'minute'")"
expect 'serie: numero de pontos' "$(psql_q "SELECT jsonb_array_length('$res'::jsonb->'series')")" 15
expect 'serie: soma de enviadas' "$(psql_q "SELECT sum((e->>'sent')::int) FROM jsonb_array_elements('$res'::jsonb->'series') e")" 12
case_done series_total
pass '(1) serie de 15 min tem 15 pontos e soma 12 enviadas'
# Cada ponto da serie tem de bater com a contagem direta na tabela, no minuto do respectivo
# carimbo (independe de o relogio virar de minuto entre a semeadura e a consulta).
for col in sent delivered; do
  bad="$(psql_q "SELECT count(*) FROM jsonb_array_elements('$res'::jsonb->'series') e
    WHERE (e->>'$col')::int <> (SELECT count(*) FROM public.talkx_recipients
      WHERE campaign_id='$(camp a)' AND date_trunc('minute', ${col}_at) = (e->>'t')::timestamptz)")"
  expect "serie: ponto de $col diverge da contagem direta" "$bad" 0
  expect "serie: minutos com $col" "$(psql_q "SELECT count(*) FROM jsonb_array_elements('$res'::jsonb->'series') e WHERE (e->>'$col')::int > 0")" 3
done
expect 'serie: entrega 2 min depois do envio' "$(psql_q "SELECT
  (SELECT min((e->>'t')::timestamptz) FROM jsonb_array_elements('$res'::jsonb->'series') e WHERE (e->>'delivered')::int > 0)
  - (SELECT min((e->>'t')::timestamptz) FROM jsonb_array_elements('$res'::jsonb->'series') e WHERE (e->>'sent')::int > 0)")" '00:02:00'
case_done series_delivered_minute
pass '(1) entregue cai no minuto do delivered_at, nao no do envio'

# --- (2) KPIs da campanha A ---------------------------------------------------
for kv in sent:12 delivered:12 replied:2 failed:0 optouts:1 remaining:0 total:12 to_confirm:0 skipped:0; do
  expect "kpis.${kv%%:*}" "$(psql_q "SELECT '$res'::jsonb->'kpis'->>'${kv%%:*}'")" "${kv##*:}"
done
expect 'kpis.delivery_rate_pct' "$(psql_q "SELECT '$res'::jsonb->'kpis'->>'delivery_rate_pct'")" '100.0'
expect 'kpis.optout_rate_pct' "$(psql_q "SELECT '$res'::jsonb->'kpis'->>'optout_rate_pct'")" '8.3'
expect 'health.recommendation_code' "$(psql_q "SELECT '$res'::jsonb->'health'->>'recommendation_code'")" 'optout_spike'
expect 'forecast nulo sem CAP-087' "$(psql_q "SELECT '$res'::jsonb->'forecast'->>'per_minute' IS NULL")" 't'
expect 'spark: 12 blocos' "$(psql_q "SELECT jsonb_array_length('$res'::jsonb->'spark'->'sent')")" 12
case_done kpis
pass '(2) KPIs: 12 enviadas/entregues, 2 respondidas, 1 opt-out da campanha (so origin=optout), taxas 100.0 e 8.3'

# --- (3) worker parado ---------------------------------------------------------
resb="$(panel "$owner" b)"
expect 'worker_state stalled' "$(psql_q "SELECT '$resb'::jsonb->'health'->>'worker_state'")" 'stalled'
expect 'recommendation stalled' "$(psql_q "SELECT '$resb'::jsonb->'health'->>'recommendation_code'")" 'stalled'
expect 'campanha ativa NAO e stalled' "$(psql_q "SELECT '$res'::jsonb->'health'->>'worker_state'")" 'sending'
case_done stalled
pass '(3) sending com pendentes e ultimo envio ha 20 min => stalled; campanha em dia => sending'

# --- (4) 6 falhas em 60 processados -------------------------------------------
resc="$(panel "$owner" c)"
expect 'high_failure' "$(psql_q "SELECT '$resc'::jsonb->'health'->>'recommendation_code'")" 'high_failure'
expect 'failed kpi' "$(psql_q "SELECT '$resc'::jsonb->'kpis'->>'failed'")" '6'
case_done high_failure
pass '(4) 6 falhas em 60 processados => high_failure'

# --- (5) comparativo com ontem -------------------------------------------------
expect 'vs_yesterday nulo sem envio ontem' "$(psql_q "SELECT jsonb_typeof('$res'::jsonb->'vs_yesterday')")" 'null'
case_done vs_yesterday_null
resd="$(panel "$owner" d)"
expect 'vs_yesterday.replied.yesterday' "$(psql_q "SELECT '$resd'::jsonb->'vs_yesterday'->'replied'->>'yesterday'")" '1'
expect 'vs_yesterday.replied.today' "$(psql_q "SELECT '$resd'::jsonb->'vs_yesterday'->'replied'->>'today'")" '2'
expect 'worker_state paused_auto' "$(psql_q "SELECT '$resd'::jsonb->'health'->>'worker_state'")" 'paused_auto'
expect 'pause_reason repassado' "$(psql_q "SELECT '$resd'::jsonb->'health'->>'pause_reason'")" 'outside_send_window'
expect 'reply_peak 10 min' "$(psql_q "SELECT '$resd'::jsonb->'reply_peak'->>'last_10_min'")" '2'
case_done vs_yesterday_value
pass '(5) vs_yesterday nulo sem envio ontem; com envio ontem traz 1 (ontem) x 2 (hoje); pausa automatica'

# --- (6) campanha vazia: zeros, sem divisao por zero --------------------------
rese="$(panel "$owner" e "10, 'minute'")"
expect 'vazia: pontos' "$(psql_q "SELECT jsonb_array_length('$rese'::jsonb->'series')")" 10
expect 'vazia: soma da serie' "$(psql_q "SELECT sum((e->>'sent')::int + (e->>'delivered')::int) FROM jsonb_array_elements('$rese'::jsonb->'series') e")" 0
expect 'vazia: taxa de entrega nula' "$(psql_q "SELECT jsonb_typeof('$rese'::jsonb->'kpis'->'delivery_rate_pct')")" 'null'
expect 'vazia: worker done' "$(psql_q "SELECT '$rese'::jsonb->'health'->>'worker_state'")" 'done'
expect 'vazia: sem atividade' "$(psql_q "SELECT '$rese'::jsonb->'kpis'->>'total'")" '0'
case_done empty_campaign
pass '(6) campanha sem destinatarios: 10 pontos zerados, taxas nulas, done'

# --- (7) bucket por hora e filtro de segmento ---------------------------------
resh="$(panel "$owner" a "180, 'hour'")"
expect 'hora: pontos' "$(psql_q "SELECT jsonb_array_length('$resh'::jsonb->'series')")" 3
expect 'hora: soma' "$(psql_q "SELECT sum((e->>'sent')::int) FROM jsonb_array_elements('$resh'::jsonb->'series') e")" 12
case_done hour_bucket
ress="$(panel "$owner" a "15, 'minute', NULL, '60000000-0000-0000-0000-000000000001'")"
expect 'segmento: enviadas' "$(psql_q "SELECT '$ress'::jsonb->'kpis'->>'sent'")" '4'
expect 'segmento: soma da serie' "$(psql_q "SELECT sum((e->>'sent')::int) FROM jsonb_array_elements('$ress'::jsonb->'series') e")" '4'
case_done segment_filter
pass '(7) bucket por hora (3 pontos, soma 12) e filtro de segmento (4 enviadas)'

# --- (8) failed_at preenchido pelo trigger -------------------------------------
expect 'failed_at preenchido no INSERT' "$(psql_q "SELECT count(*) FROM public.talkx_recipients WHERE status='failed' AND failed_at IS NULL")" '0'
rid="$(psql_q "INSERT INTO public.talkx_recipients (campaign_id, status) VALUES ('$(camp b)', 'sending') RETURNING id")"
psql_q "UPDATE public.talkx_recipients SET status = 'failed' WHERE id = '$rid'" >/dev/null
expect 'failed_at preenchido no UPDATE' "$(psql_q "SELECT failed_at IS NOT NULL FROM public.talkx_recipients WHERE id='$rid'")" 't'
psql_q "UPDATE public.talkx_recipients SET failed_at = now() - interval '1 day' WHERE id = '$rid'" >/dev/null
psql_q "UPDATE public.talkx_recipients SET status = 'failed' WHERE id = '$rid'" >/dev/null
expect 'failed_at nao e reescrito' "$(psql_q "SELECT failed_at < now() - interval '23 hours' FROM public.talkx_recipients WHERE id='$rid'")" 't'
case_done failed_at_trigger
pass '(8) failed_at preenchido no INSERT/UPDATE para failed e preservado'

# --- (9) autorizacao -----------------------------------------------------------
expect 'dono' "$(psql_q "$owner SELECT public.talkx_monitor_panel('$(camp a)') IS NOT NULL")" 't'
case_done owner_ok
expect 'admin' "$(psql_q "$admin SELECT public.talkx_monitor_panel('$(camp a)') IS NOT NULL")" 't'
case_done admin_ok

state_of() { # <sessao> <expr> -> SQLSTATE do erro ou OK

  psql_test -Atq 2>&1 <<SQL | grep -E '^(NOTICE:|psql:)' | tail -1 | sed 's/^NOTICE: *//'
$1
DO \$\$ BEGIN PERFORM $2; RAISE NOTICE 'OK'; EXCEPTION WHEN OTHERS THEN RAISE NOTICE '%', SQLSTATE; END \$\$;
SQL
}
expect 'outro agente => 42501' "$(state_of "$other" "public.talkx_monitor_panel('$(camp a)')")" '42501'
case_done other_agent_denied
expect 'campanha inexistente => 42501' "$(state_of "$admin" "public.talkx_monitor_panel('50000000-0000-0000-0000-0000000000ff')")" '42501'
case_done missing_campaign_denied
expect 'sem login (uid nulo) => 42501' "$(state_of "SET ROLE authenticated; RESET request.jwt.claim.sub;" "public.talkx_monitor_panel('$(camp a)')")" '42501'
expect 'anon => 42501 (sem EXECUTE)' "$(state_of "SET ROLE anon;" "public.talkx_monitor_panel('$(camp a)')")" '42501'
case_done anon_denied
expect 'p_bucket invalido => 22023' "$(state_of "$owner" "public.talkx_monitor_panel('$(camp a)', 15, 'week')")" '22023'
expect 'p_window_minutes invalido => 22023' "$(state_of "$owner" "public.talkx_monitor_panel('$(camp a)', 0)")" '22023'
case_done invalid_args
pass '(9) dono e admin leem; outro agente, id inexistente, sem login e anon recebem 42501; argumentos invalidos 22023'

# --- (9b) brecha de NULL na autorizacao --------------------------------------
# Usuario autenticado SEM linha em profiles e sem papel de admin: a comparacao
# de dono vira NULL e o IF nao pode deixar passar.
noprofile="SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000004';"
expect 'sem profiles => 42501' "$(state_of "$noprofile" "public.talkx_monitor_panel('$(camp a)')")" '42501'
case_done no_profile_denied
pass '(9b) authenticated sem linha em profiles recebe 42501'
# Campanha com created_by NULL lida por nao-admin => 42501; admin segue lendo.
expect 'created_by NULL + nao-admin => 42501' "$(state_of "$other" "public.talkx_monitor_panel('$(camp f)')")" '42501'
expect 'created_by NULL + admin le' "$(psql_q "$admin SELECT public.talkx_monitor_panel('$(camp f)') IS NOT NULL")" 't'
case_done null_owner_denied
pass '(9b) campanha sem dono: nao-admin recebe 42501, admin le'

# --- (10) ACL, definer e replay ------------------------------------------------
sig='public.talkx_monitor_panel(uuid,integer,text,date,uuid)'
expect 'anon sem EXECUTE' "$(psql_q "SELECT has_function_privilege('anon','$sig','EXECUTE')")" 'f'
expect 'authenticated com EXECUTE' "$(psql_q "SELECT has_function_privilege('authenticated','$sig','EXECUTE')")" 't'
expect 'SECURITY DEFINER com search_path fixo' "$(psql_q "SELECT prosecdef AND 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE oid='$sig'::regprocedure")" 't'
case_done acl
psql_test < "$migration" >/dev/null || fail 'segunda aplicacao da migration falhou'
expect 'uma unica funcao' "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_monitor_panel'")" '1'
case_done replay
pass '(10) ACL, SECURITY DEFINER, search_path fixo e migration replayavel'

for c in "${CASES_EXPECTED[@]}"; do
  [[ -n "${CASES_SEEN[$c]:-}" ]] || fail "caso nao medido: $c"
done
pass "todos os ${#CASES_EXPECTED[@]} casos medidos"
