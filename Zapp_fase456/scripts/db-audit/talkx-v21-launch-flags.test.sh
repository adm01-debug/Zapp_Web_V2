#!/usr/bin/env bash
# Harness descartável: V21 — flags de lançamento persistidas.
# Prova: (1) colunas respect_suppression/confirm_consent/launched_by/launched_at;
#        (2) transition start grava launched_by/at; (3) respect_suppression=false
#        sem admin é recusado (42501).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=0 -U postgres -d postgres "$@"; }

test_password='talkx_v21_test_only'
cid="talkx-v21-$RANDOM$RANDOM"
cleanup() { if [[ "$cid" =~ ^talkx-v21-[0-9]+$ ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; }
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

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true
);
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(p_tz text) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'connected',
  instance_id text
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  message_template text,
  description text,
  objective text,
  audience_source text,
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text,
  typing_delay_min integer,
  typing_delay_max integer,
  send_interval_min integer,
  send_interval_max integer,
  status text NOT NULL DEFAULT 'draft',
  pause_reason text,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX talkx_campaigns_creator_draft_creation_key_uidx
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.talkx_campaign_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid,
  event_type text,
  message text,
  actor_id uuid
);

INSERT INTO public.profiles (id, user_id, is_active)
VALUES ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true);
SQL

# RED: colunas de flag ainda não existem
red_col="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name='respect_suppression'" 2>&1 || true)"
[[ "$red_col" == '0' ]] || fail "RED: respect_suppression deveria nao existir antes da migration (got $red_col)"

# GREEN: aplica migration
psql_test < "$repo_root/supabase/migrations/20260930640000_talkx_v21_launch_flags.sql" >/dev/null \
  || fail 'migration V21 nao aplicou (GREEN)'

# (1) colunas existem com defaults corretos
colcount="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name IN ('respect_suppression','confirm_consent','launched_by','launched_at')")"
[[ "$colcount" == '4' ]] || fail "GREEN: esperado 4 colunas de flag, got $colcount"

def_suppress="$(psql_test -Atqc "SELECT column_default FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name='respect_suppression'")"
[[ "$def_suppress" == 'true' ]] || fail "GREEN: default respect_suppression deveria ser true (got $def_suppress)"
def_consent="$(psql_test -Atqc "SELECT column_default FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name='confirm_consent'")"
[[ "$def_consent" == 'false' ]] || fail "GREEN: default confirm_consent deveria ser false (got $def_consent)"

# (2) transition start grava launched_by/at
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, message_template, status, total_recipients)
VALUES ('10000000-0000-0000-0000-000000000001', 'Ola {{nome}}', 'draft', 1);
INSERT INTO public.talkx_recipients (campaign_id, status)
VALUES ('10000000-0000-0000-0000-000000000001', 'pending');
SQL
psql_test >/dev/null <<'SQL'
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SELECT public.transition_talkx_campaign('10000000-0000-0000-0000-000000000001', 'start', NULL, '20000000-0000-0000-0000-000000000001');
COMMIT;
SQL
launched="$(psql_test -Atqc "SELECT launched_by::text || ':' || (launched_at IS NOT NULL)::text FROM public.talkx_campaigns WHERE id='10000000-0000-0000-0000-000000000001'")"
[[ "$launched" == '20000000-0000-0000-0000-000000000001:true' ]] || fail "GREEN: launched_by/at deveria ser gravado no start (got $launched)"

# (3) respect_suppression=false sem admin é recusado (42501)
guard_err="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; SELECT public.save_talkx_campaign_draft(NULL, NULL, '40000000-0000-0000-0000-000000000001', '{\"name\":\"C\",\"message_template\":\"Oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"respect_suppression\":false}'); COMMIT;" 2>&1 || true)"
[[ "$guard_err" == *'talkx_respect_suppression_admin_only'* ]] || fail "GREEN: respect_suppression=false deveria exigir admin (got $guard_err)"

# (4) respect_suppression=true (default) salva o draft com flags
save_out="$(psql_test -Atqc "BEGIN; SET LOCAL request.jwt.claim.role='authenticated'; SET LOCAL request.jwt.claim.sub='30000000-0000-0000-0000-000000000001'; SELECT public.save_talkx_campaign_draft(NULL, NULL, '40000000-0000-0000-0000-000000000001', '{\"name\":\"C\",\"message_template\":\"Oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"respect_suppression\":true,\"confirm_consent\":true}'); COMMIT;" 2>&1 || true)"
[[ "$save_out" == *'(1 row)'* || "$save_out" == *','* ]] || fail "GREEN: draft com flags deveria salvar (got $save_out)"
flags_saved="$(psql_test -Atqc "SELECT respect_suppression::text || ':' || confirm_consent::text FROM public.talkx_campaigns WHERE draft_creation_key='40000000-0000-0000-0000-000000000001'")"
[[ "$flags_saved" == 'true:true' ]] || fail "GREEN: flags deveriam persistir true:true (got $flags_saved)"

echo '[OK] Talk X V21: flags de lançamento persistidas; start grava launched_by/at; desmarcar respeito exige admin.'

# --- N-099: confirm_talkx_campaign_launch (aplica as migrations REAIS) ---------
# O stub de is_admin_or_supervisor do V21 (SELECT false) ja cumpriu seu papel acima;
# daqui em diante so o user 3000...0002 e admin. Nao altera nenhuma checagem V21.
mig1="$repo_root/supabase/migrations/20261009230001_n099_talkx_confirm_launch.sql"
mig2="$repo_root/supabase/migrations/20261009230002_n099_talkx_confirm_launch_launched_by.sql"
psql_strict() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
# Executa a funcao como papel real + claims (papel e sub), numa transacao.
call_as() { # <role> <sub> <sql>
  psql_test -Atc "BEGIN; SET LOCAL ROLE $1; SET LOCAL request.jwt.claim.role='$1'; SET LOCAL request.jwt.claim.sub='$2'; $3; COMMIT;" 2>&1 || true
}
confirm_sql() { # <campaign> <revision> <json>
  printf "SELECT campaign_id, revision FROM public.confirm_talkx_campaign_launch('%s', %s, '%s'::jsonb)" "$1" "$2" "$3"
}
all3='{"consent":true,"content":true,"suppression":true}'
user_nonadmin='30000000-0000-0000-0000-000000000001'
user_admin='30000000-0000-0000-0000-000000000002'
prof_nonadmin='20000000-0000-0000-0000-000000000001'
prof_admin='20000000-0000-0000-0000-000000000002'
c_main='10000000-0000-0000-0000-000000000002'
c_pre='10000000-0000-0000-0000-000000000003'
c_rb='10000000-0000-0000-0000-000000000004'

psql_strict >/dev/null <<SQL
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS \$\$ SELECT p_user_id = '$user_admin'::uuid \$\$;
INSERT INTO public.profiles (id, user_id, is_active) VALUES ('$prof_admin', '$user_admin', true);
INSERT INTO public.talkx_campaigns (id, message_template, status, total_recipients)
VALUES ('$c_main', 'Ola', 'draft', 1), ('$c_rb', 'Ola', 'draft', 1);
INSERT INTO public.talkx_campaigns (id, message_template, status, total_recipients, launched_by, launched_at)
VALUES ('$c_pre', 'Ola', 'draft', 1, '$prof_nonadmin', '2026-01-01T00:00:00Z');
SQL

# RED: sem as migrations a funcao e as colunas nao existem
red_fn="$(call_as authenticated "$user_admin" "$(confirm_sql "$c_main" 1 "$all3")")"
[[ "$red_fn" == *'does not exist'* ]] || fail "RED: confirm_talkx_campaign_launch nao deveria existir antes das migrations (got $red_fn)"
red_cols="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name IN ('launch_confirmations','launch_confirmed_by','launch_confirmed_at')")"
[[ "$red_cols" == '0' ]] || fail "RED: colunas launch_confirm* nao deveriam existir antes das migrations (got $red_cols)"

# GREEN: aplica as migrations reais, com ON_ERROR_STOP, duas vezes (idempotencia)
for _ in 1 2; do
  psql_strict >/dev/null < "$mig1" || fail 'migration 20261009230001 nao aplicou limpa'
  psql_strict >/dev/null < "$mig2" || fail 'migration 20261009230002 nao aplicou limpa'
done
legacy_cols="$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name IN ('launch_confirmations','launch_confirmed_by','launch_confirmed_at','launched_by','launched_at')")"
[[ "$legacy_cols" == '5' ]] || fail "GREEN: esperado 5 colunas de confirmacao/lancamento (got $legacy_cols)"

# (a) GRANT/REVOKE por privilegio e por chamada com papel real
sig='public.confirm_talkx_campaign_launch(uuid,bigint,jsonb)'
for pair in authenticated:t anon:f service_role:f public:f; do
  r="${pair%%:*}"; want="${pair##*:}"
  got="$(psql_test -Atqc "SELECT has_function_privilege('$r', '$sig', 'EXECUTE')")"
  [[ "$got" == "$want" ]] || fail "GREEN: EXECUTE de $r deveria ser $want (got $got)"
done
err_anon="$(call_as anon '' "$(confirm_sql "$c_main" 1 "$all3")")"
[[ "$err_anon" == *'permission denied for function'* ]] || fail "GREEN: anon nao pode executar (got $err_anon)"
err_svc="$(call_as service_role '' "$(confirm_sql "$c_main" 1 "$all3")")"
[[ "$err_svc" == *'permission denied for function'* ]] || fail "GREEN: service_role nao tem EXECUTE (got $err_svc)"

# (b) authenticated sem papel admin/supervisor -> 42501
err_noadmin="$(call_as authenticated "$user_nonadmin" "$(confirm_sql "$c_main" 1 "$all3")")"
[[ "$err_noadmin" == *'talkx_confirm_launch_unauthorized'* ]] || fail "GREEN: nao-admin deveria dar 42501 (got $err_noadmin)"

state() { psql_test -Atqc "SELECT revision::text || ':' || COALESCE(launch_confirmations::text,'null') FROM public.talkx_campaigns WHERE id='$1'"; }

# (c) revisao velha recusada, sem alterar a linha
err_rev="$(call_as authenticated "$user_admin" "$(confirm_sql "$c_main" 999 "$all3")")"
[[ "$err_rev" == *'talkx_campaign_stale_revision'* ]] || fail "GREEN: revisao antiga deveria ser recusada (got $err_rev)"

# (d) as 3 chaves sao obrigatorias e precisam ser true; nada muda
for bad in '{}' '{"consent":true,"content":true}' '{"consent":true,"content":true,"suppression":false}' '{"consent":"true","content":true,"suppression":true}'; do
  err_keys="$(call_as authenticated "$user_admin" "$(confirm_sql "$c_main" 1 "$bad")")"
  [[ "$err_keys" == *'talkx_confirm_launch_missing_keys'* ]] || fail "GREEN: $bad deveria dar missing_keys (got $err_keys)"
done
[[ "$(state "$c_main")" == '1:null' ]] || fail "GREEN: recusas nao podem alterar a campanha (got $(state "$c_main"))"

# (e) campanha inexistente e campanha ja em envio
err_nf="$(call_as authenticated "$user_admin" "$(confirm_sql 'ffffffff-0000-0000-0000-000000000000' 1 "$all3")")"
[[ "$err_nf" == *'talkx_campaign_not_found'* ]] || fail "GREEN: campanha inexistente (got $err_nf)"
err_sending="$(call_as authenticated "$user_admin" "$(confirm_sql '10000000-0000-0000-0000-000000000001' 2 "$all3")")"
[[ "$err_sending" == *'talkx_campaign_not_confirmable'* ]] || fail "GREEN: campanha em envio nao se confirma (got $err_sending)"

# (f) sucesso grava confirmations/by/at e launched_by/at; by e o PERFIL (FK), nao o auth.uid()
ok_out="$(call_as authenticated "$user_admin" "$(confirm_sql "$c_main" 1 "$all3")")"
[[ "$ok_out" == *"$c_main|2"* ]] || fail "GREEN: retorno deveria trazer campanha e revisao 2 (got $ok_out)"
row="$(psql_test -Atqc "SELECT launch_confirmations::text || ':' || launch_confirmed_by::text || ':' || (launch_confirmed_at IS NOT NULL)::text || ':' || launched_by::text || ':' || (launched_at IS NOT NULL)::text || ':' || revision::text FROM public.talkx_campaigns WHERE id='$c_main'")"
[[ "$row" == "{\"consent\": true, \"content\": true, \"suppression\": true}:$prof_admin:true:$prof_admin:true:2" ]] || fail "GREEN: gravacao incorreta (got $row)"

# (g) reenvio com a revisao antiga e recusado
err_replay="$(call_as authenticated "$user_admin" "$(confirm_sql "$c_main" 1 "$all3")")"
[[ "$err_replay" == *'talkx_campaign_stale_revision'* ]] || fail "GREEN: replay com revisao antiga (got $err_replay)"

# (h) launched_by/at ja gravados (primeiro lancamento) sao preservados
call_as authenticated "$user_admin" "$(confirm_sql "$c_pre" 1 "$all3")" >/dev/null
pre="$(psql_test -Atqc "SELECT launched_by::text || ':' || launch_confirmed_by::text FROM public.talkx_campaigns WHERE id='$c_pre'")"
[[ "$pre" == "$prof_nonadmin:$prof_admin" ]] || fail "GREEN: launched_by do primeiro lancamento deve ser preservado (got $pre)"

# (i) rollback da 20261009230002 e da 20261009230001: SQL extraido das proprias migrations, executado de verdade
rollback_of() { grep '^--   ' "$1" | sed 's/^--   //'; }
[[ -n "$(rollback_of "$mig2")" && -n "$(rollback_of "$mig1")" ]] || fail 'migrations sem bloco de rollback executavel'
rollback_of "$mig2" | psql_strict >/dev/null || fail 'rollback da 20261009230002 nao executou'
def_after_rb2="$(psql_test -Atqc "SELECT pg_get_functiondef('$sig'::regprocedure)")"
[[ "$def_after_rb2" == *'launch_confirmations'* && "$def_after_rb2" != *'launched_by'* ]] || fail 'rollback 2 deveria restaurar o corpo da migration 1 (sem launched_by)'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated', '$sig', 'EXECUTE') AND NOT has_function_privilege('anon', '$sig', 'EXECUTE')")" == 't' ]] || fail 'rollback 2 deveria manter GRANT authenticated / REVOKE anon'
call_as authenticated "$user_admin" "$(confirm_sql "$c_rb" 1 "$all3")" >/dev/null
rb_row="$(psql_test -Atqc "SELECT (launch_confirmed_by IS NOT NULL)::text || ':' || (launched_by IS NULL)::text FROM public.talkx_campaigns WHERE id='$c_rb'")"
[[ "$rb_row" == 'true:true' ]] || fail "rollback 2: funcao restaurada nao grava launched_by (got $rb_row)"

rollback_of "$mig1" | psql_strict >/dev/null || fail 'rollback da 20261009230001 nao executou'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname='confirm_talkx_campaign_launch'")" == '0' ]] || fail 'rollback 1 deveria remover a funcao'
[[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name LIKE 'launch\_confirm%'")" == '0' ]] || fail 'rollback 1 deveria remover as colunas launch_confirm*'
[[ "$(psql_test -Atqc "SELECT count(*) FROM information_schema.columns WHERE table_name='talkx_campaigns' AND column_name IN ('launched_by','launched_at')")" == '2' ]] || fail 'rollback nao pode remover launched_by/launched_at (pertencem ao V21)'

echo '[OK] Talk X N-099: migrations reais aplicam limpas; GRANT/REVOKE provados com papeis reais; admin via auth.uid(); 3 chaves; revisao atual; grava confirmations/by/at + launched_by/at; rollbacks executam.'
