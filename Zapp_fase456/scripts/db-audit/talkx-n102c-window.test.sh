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
postgres_image="${TALKX_N102C_WINDOW_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
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

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_weekdays smallint[],
  respect_dnd boolean NOT NULL DEFAULT true
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

# ---- corpo ANTERIOR (defeito): fuso da sessao (UTC) + ISODOW; sem restricao de ACL ----
psql_test >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open(p_campaign_id uuid, p_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_dnd_hours jsonb;
  v_weekday integer;
  v_start_minutes integer;
  v_end_minutes integer;
  v_minutes_of_day integer;
BEGIN
  SELECT * INTO v_campaign FROM public.talkx_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_campaign.send_weekdays IS NOT NULL THEN
    v_weekday := EXTRACT(ISODOW FROM p_at)::integer % 7;
    IF NOT (v_weekday = ANY(v_campaign.send_weekdays)) THEN RETURN false; END IF;
  END IF;
  IF v_campaign.respect_dnd THEN
    SELECT value INTO v_dnd_hours FROM public.talkx_settings WHERE key = 'dnd_hours';
    IF v_dnd_hours IS NOT NULL AND jsonb_typeof(v_dnd_hours) = 'object' THEN
      v_minutes_of_day := EXTRACT(HOUR FROM p_at)::integer * 60 + EXTRACT(MINUTE FROM p_at)::integer;
      v_start_minutes := (split_part(v_dnd_hours ->> 'start', ':', 1))::integer * 60 + (split_part(v_dnd_hours ->> 'start', ':', 2))::integer;
      v_end_minutes := (split_part(v_dnd_hours ->> 'end', ':', 1))::integer * 60 + (split_part(v_dnd_hours ->> 'end', ':', 2))::integer;
      IF EXTRACT(DOW FROM p_at) = 0 AND (v_dnd_hours ->> 'sundays')::boolean = false THEN RETURN true; END IF;
      IF jsonb_array_length(v_dnd_hours -> 'holidays') > 0 THEN
        IF p_at::date = ANY(v_dnd_hours -> 'holidays')::date[] THEN RETURN true; END IF;
      END IF;
      IF v_start_minutes < v_end_minutes THEN
        IF v_minutes_of_day >= v_start_minutes AND v_minutes_of_day < v_end_minutes THEN RETURN false; END IF;
      ELSIF v_start_minutes > v_end_minutes THEN
        IF v_minutes_of_day >= v_start_minutes OR v_minutes_of_day < v_end_minutes THEN RETURN false; END IF;
      END IF;
    END IF;
  END IF;
  RETURN true;
END;
$function$;
SQL

# ---- GREEN: aplica a migration corrigida (e prova que e replayavel) ----
if [[ -z "$skip_fix" ]]; then
  psql_test < "$migration" >/dev/null || fail 'a migration 20261011003008 nao aplicou'
  psql_test < "$migration" >/dev/null || fail 'a migration 20261011003008 nao e replayavel (2a aplicacao falhou)'
fi

window() { psql_test -Atqc "SELECT public.talkx_campaign_window_open('$1'::uuid, '$2'::timestamptz)"; }

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

# ---- Rollback executavel: extrai a linha do rodape da migration, derruba a funcao e
#      prova que reaplicar a migration a recria (reversivel de verdade) ----
rollback_sql="$(grep -m1 -oE 'DROP FUNCTION[^;]*;' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'migration sem linha de rollback executavel (DROP FUNCTION ...)'
psql_test -c "$rollback_sql" >/dev/null || fail "rollback nao executou: $rollback_sql"
[[ -z "$(psql_test -Atqc "SELECT to_regprocedure('public.talkx_campaign_window_open(uuid,timestamptz)')")" ]] \
  || fail 'rollback nao removeu a funcao'
psql_test < "$migration" >/dev/null || fail 'migration nao reaplica apos o rollback'
[[ -n "$(psql_test -Atqc "SELECT to_regprocedure('public.talkx_campaign_window_open(uuid,timestamptz)')")" ]] \
  || fail 'migration nao recriou a funcao apos o rollback'
printf '[OK] Rollback N-102c: %s remove a funcao e a migration a recria.\n' "$rollback_sql"
