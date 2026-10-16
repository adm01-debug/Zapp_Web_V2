#!/usr/bin/env bash
set -Eeuo pipefail

# N-102c — janela de envio das campanhas TalkX: prova, em PostgreSQL 17 descartavel,
# que public.talkx_campaign_window_open (migration 20261011003008_talkx_n102c_window_open.sql):
#   (1) ABRE dentro da janela (dia da semana permitido em send_weekdays);
#   (2) FECHA fora dela, considerando o dia LOCAL da campanha;
#   (3) RESPEITA O FUSO (schedule_timezone): o mesmo instante que e segunda-feira em
#       UTC mas domingo em America/Sao_Paulo e avaliado como domingo;
#   (4) restringe acesso: EXECUTE so para service_role (nem PUBLIC/anon/authenticated).
#
# RED sem a correcao: com TALKX_N102C_SKIP_FIX=1 o teste NAO aplica a migration e a
# funcao "antiga" (fuso da sessao UTC + ISODOW) permanece — (2),(3) e o ACL falham,
# o script sai 1. GREEN: aplica a migration e os 4 passam.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_N102C_WINDOW_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-n102c-window-$RANDOM-$$"
test_password="n102c_window_test_only"
migration="$repo_root/supabase/migrations/20261011003008_talkx_n102c_window_open.sql"
skip_fix="${TALKX_N102C_SKIP_FIX:-}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-n102c-window-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- roles + fixture minimo (so as colunas que a funcao le) ----
psql_test >/dev/null <<'SQL'
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_weekdays smallint[],
  respect_dnd boolean NOT NULL DEFAULT true,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false
);

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

INSERT INTO public.talkx_settings(key, value)
VALUES ('dnd_hours', '{"start":"22:00","end":"08:00","sundays":true,"holidays":[]}'::jsonb);

INSERT INTO public.talkx_campaigns(id, schedule_timezone, send_weekdays, respect_dnd) VALUES
  ('30000000-0000-0000-0000-000000000001', 'America/Sao_Paulo', '{1,2,3,4,5}', false),
  ('30000000-0000-0000-0000-000000000002', 'America/Sao_Paulo', '{0}',         false),
  ('30000000-0000-0000-0000-000000000003', 'America/Sao_Paulo', '{1}',         false);
SQL

# ---- assinatura REAL da predecessora: TABLE, nunca boolean ----
# Sem o fix, este corpo ignora o fuso local e mantém EXECUTE público.
psql_test >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open(p_campaign_id uuid, p_at timestamptz DEFAULT now())
RETURNS TABLE(allowed boolean, reason text, next_window timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT send_weekdays IS NULL OR EXTRACT(DOW FROM p_at)::smallint = ANY(send_weekdays),
    NULL::text, NULL::timestamptz
  FROM public.talkx_campaigns WHERE id = p_campaign_id;
$function$;
SQL

# ---- GREEN: aplica a migration corrigida (e prova que e replayavel) ----
if [[ -z "$skip_fix" ]]; then
  psql_test < "$migration" >/dev/null || fail 'a migration 20261011003008 nao aplicou'
  psql_test < "$migration" >/dev/null || fail 'a migration 20261011003008 nao e replayavel (2a aplicacao falhou)'
fi

window() { psql_test -Atqc "SET request.jwt.claim.role = 'service_role'; SET ROLE service_role; SELECT allowed FROM public.talkx_campaign_window_open('$1'::uuid, '$2'::timestamptz)"; }

# (1) ABRE dentro da janela — segunda 10:00 em Sao Paulo, semana permitida {1..5}
[[ "$(window 30000000-0000-0000-0000-000000000001 2026-10-12T13:00:00+00)" == 't' ]] \
  || fail 'deveria ABRIR dentro da janela (seg 10:00 America/Sao_Paulo, send_weekdays {1..5})'

# (2) FECHA fora dela pelo DIA LOCAL — domingo 22:00 em SP (UTC ja e segunda), {1} permite so segunda
[[ "$(window 30000000-0000-0000-0000-000000000003 2026-10-12T01:00:00+00)" == 'f' ]] \
  || fail 'deveria FECHAR (domingo local nao esta em send_weekdays {1}); fuso/dia local ignorados'

# (3) RESPEITA O FUSO — mesmo instante e domingo local em SP e esta em {0}: ABRE
[[ "$(window 30000000-0000-0000-0000-000000000002 2026-10-12T01:00:00+00)" == 't' ]] \
  || fail 'deveria ABRIR (domingo local em America/Sao_Paulo, send_weekdays {0}); avaliou em UTC'

# (4) ACL restrita — EXECUTE so para service_role
[[ "$(psql_test -Atqc "SELECT has_function_privilege('service_role','public.talkx_campaign_window_open(uuid,timestamptz)','EXECUTE')")" == 't' ]] \
  || fail 'service_role deveria ter EXECUTE na RPC'
for role in authenticated anon; do
  [[ "$(psql_test -Atqc "SELECT has_function_privilege('$role','public.talkx_campaign_window_open(uuid,timestamptz)','EXECUTE')")" == 'f' ]] \
    || fail "$role NAO deveria ter EXECUTE na RPC"
done

printf '[OK] Talk X N-102c: window_open abre dentro, fecha fora (dia local) e respeita o fuso; ACL restrita a service_role.\n'

# A migration não apaga a RPC predecessora nem muda seu retorno.
[[ "$(psql_test -Atqc "SELECT pg_get_function_result('public.talkx_campaign_window_open(uuid,timestamptz)'::regprocedure)")" == 'TABLE(allowed boolean, reason text, next_window timestamp with time zone)' ]] \
  || fail 'assinatura TABLE da predecessora não foi preservada'

# DND e horários são parte do mesmo contrato, não podem sumir no replace.
psql_test -c "UPDATE public.talkx_campaigns SET respect_dnd = true WHERE id = '30000000-0000-0000-0000-000000000001'" >/dev/null
[[ "$(window 30000000-0000-0000-0000-000000000001 2026-10-13T02:00:00+00)" == 'f' ]] || fail 'DND noturno deveria fechar'
psql_test -c "UPDATE public.talkx_campaigns SET respect_dnd = false, business_hours_only = true WHERE id = '30000000-0000-0000-0000-000000000001'" >/dev/null
[[ "$(window 30000000-0000-0000-0000-000000000001 2026-10-12T22:00:00+00)" == 'f' ]] || fail 'horário comercial deveria fechar às 19h local'
[[ "$(window 30000000-0000-0000-0000-000000000001 2026-10-12T13:00:00+00)" == 't' ]] || fail 'horário comercial deveria abrir às 10h local'
psql_test -c "UPDATE public.talkx_campaigns SET schedule_timezone = 'invalid/zone' WHERE id = '30000000-0000-0000-0000-000000000001'" >/dev/null
[[ "$(window 30000000-0000-0000-0000-000000000001 2026-10-12T13:00:00+00)" == 'f' ]] || fail 'timezone inválido deveria fechar'
printf '[OK] Assinatura TABLE, DND, business_hours e timezone inválido preservados.\n'
