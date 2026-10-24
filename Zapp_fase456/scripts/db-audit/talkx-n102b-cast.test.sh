#!/usr/bin/env bash
# N-102b (fatia b) — send_weekdays/respect_dnd persistem via save/update com 22023.
# Pré-estado = corpos VIGENTES extraídos verbatim da base (últimas definições:
# save em 20261003232707, update em 20261002551230), sem nenhum tratamento de
# send_weekdays. Passo 0 prova a dependência da fatia a (sem as colunas, a chamada
# cai em 42703). Passo 1 prova o VERMELHO real (a vigente ignora send_weekdays);
# com TALKX_N102B_SKIP_FIX=1 o teste para aí.
# Sem a variável, aplica a migration REAL e prova o fix, as proteções preservadas
# (X014 papel, X017 supressão, X018 ritmo/teto, max_per_minute aceito no update)
# e o ciclo do rollback (achata o bloco '--   ' do cabeçalho da migration).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261011003006_talkx_n102b_cast.sql"
IMAGE="${TALKX_N102B_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
SKIP_FIX="${TALKX_N102B_SKIP_FIX:-0}"
CNAME="talkx-n102b-test-$$"

cleanup() { docker rm -f "$CNAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$CNAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CNAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
PSQL=(docker exec -i "$CNAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q -A -t)

echo "== N-102b: sobe esquema mínimo (estado pós-fatia-a: colunas existem, RPCs vigentes) =="
cat <<'SQL' | docker exec -i "$CNAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.test_sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT CASE WHEN NULLIF(current_setting('app.test_sub', true), '') IS NULL THEN 'anon' ELSE 'authenticated' END $$;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.profiles (user_id, role, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'supervisor', true),
  ('22222222-2222-2222-2222-222222222222', 'agent', true);
CREATE FUNCTION public.is_admin_or_supervisor(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM public.profiles
                     WHERE user_id = p_user_id AND role IN ('admin', 'supervisor')
                       AND is_active = true) $$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(p_tz text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_tz IS NOT NULL AND p_tz <> '' $$;
CREATE FUNCTION public.talkx_resolve_speed_pace(
  p_profile text, p_si_min integer, p_si_max integer, p_td_min integer, p_td_max integer)
RETURNS TABLE(speed_profile text, send_interval_min integer, send_interval_max integer,
              typing_delay_min integer, typing_delay_max integer)
LANGUAGE sql IMMUTABLE AS
  $$ SELECT COALESCE(p_profile, 'moderate'), COALESCE(p_si_min, 8000),
            COALESCE(p_si_max, 20000), COALESCE(p_td_min, 1500), COALESCE(p_td_max, 4000) $$;
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value text NOT NULL);
INSERT INTO public.talkx_settings (key, value) VALUES ('max_per_minute_per_connection', '6');
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, instance_id text);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, message_template text, description text, objective text,
  audience_source text, audience_filters jsonb, segment_id uuid, template_id uuid,
  whatsapp_connection_id uuid, media_url text, media_type text,
  scheduled_at timestamptz, schedule_timezone text,
  send_window_start time, send_window_end time, business_hours_only boolean,
  send_weekdays smallint[], respect_dnd boolean NOT NULL DEFAULT true,
  speed_profile text, typing_delay_min integer, typing_delay_max integer,
  send_interval_min integer, send_interval_max integer, max_per_minute smallint,
  respect_suppression boolean, confirm_consent boolean, legal_basis text,
  consent_confirmed_by uuid, consent_confirmed_at timestamptz,
  draft_step integer, owner uuid, template_version_id uuid,
  status text, created_by uuid, draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz, updated_at timestamptz,
  UNIQUE (created_by, draft_creation_key)
);
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid,
  event_type text, actor_id uuid, message text);
SQL

echo "== N-102b passo 0: sem as colunas da fatia a, a chamada FALHA (dependência em runtime) =="
docker exec -i "$CNAME" psql -U postgres -d postgres -X -q -c \
  "ALTER TABLE public.talkx_campaigns DROP COLUMN send_weekdays, DROP COLUMN respect_dnd;" >/dev/null
instala_vigentes() { # extrai da base as últimas definições (verbatim, 1 ocorrência cada)
  local save_src="$ROOT/supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql"
  local upd_src="$ROOT/supabase/migrations/20261002551230_talkx_limits_ritmo.sql"
  [ "$(grep -c '^CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft(' "$save_src")" = "1" ] || { echo "FALHOU: save vigente ambíguo na base"; exit 1; }
  [ "$(grep -c '^CREATE OR REPLACE FUNCTION public.update_talkx_campaign_limits(' "$upd_src")" = "1" ] || { echo "FALHOU: update vigente ambíguo na base"; exit 1; }
  { awk '/^CREATE OR REPLACE FUNCTION public\.save_talkx_campaign_draft\(/{f=1} f{print} f&&/^\$function\$;$/{exit}' "$save_src"
    awk '/^CREATE OR REPLACE FUNCTION public\.update_talkx_campaign_limits\(/{f=1} f{print} f&&/^\$function\$;$/{exit}' "$upd_src"; } | \
    docker exec -i "$CNAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q -f /dev/stdin >/dev/null
  local nowd
  nowd="$(docker exec -i "$CNAME" psql -U postgres -d postgres -X -q -A -t \
    -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('save_talkx_campaign_draft','update_talkx_campaign_limits') AND p.prosrc LIKE '%send_weekdays%';")"
  [ "$nowd" = "0" ] || { echo "FALHOU: pré-estado já trata send_weekdays"; exit 1; }
}
echo "== N-102b pré-estado: instala as RPCs VIGENTES (sem send_weekdays) =="
instala_vigentes

ADMIN_S="11111111-1111-1111-1111-111111111111"
AGENT_S="22222222-2222-2222-2222-222222222222"
call() { # call <sub> <sql...>  -> executa como o sub informado (verbose p/ expor SQLSTATE)
  local sub="$1"; shift
  docker exec -i "$CNAME" psql -U postgres -d postgres -X -q -A -t -v VERBOSITY=verbose \
    -c "SET app.test_sub = '$sub';" "$@" 2>&1
}
expect_code() { # expect_code <sub> <codigo> <sql...>  -> exige erro com esse SQLSTATE
  local sub="$1" code="$2"; shift 2
  local out
  out="$(call "$sub" -v ON_ERROR_STOP=1 "$@")" && {
    echo "FALHOU: esperava erro $code, mas passou: $*"; return 1; }
  echo "$out" | grep -q "$code" || {
    echo "FALHOU: esperava SQLSTATE $code, veio: $out"; return 1; }
}
echo "== N-102b: aplica a migration REAL (o CREATE passa; a coluna faz falta na chamada) =="
docker exec -i "$CNAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q \
  -f /dev/stdin < "$MIGRATION" >/dev/null
expect_code "$ADMIN_S" 42703 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000000'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\"}');"
echo "OK passo 0: sem a fatia a a chamada cai em 42703 (coluna inexistente)"
docker exec -i "$CNAME" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -c \
  "ALTER TABLE public.talkx_campaigns ADD COLUMN send_weekdays smallint[], ADD COLUMN respect_dnd boolean NOT NULL DEFAULT true;" >/dev/null
echo "== N-102b: fatia a simulada (colunas criadas); reinstala as VIGENTES p/ o vermelho =="
instala_vigentes
fresh_campaign() { # fresh_campaign <creation_key> -> imprime "<id> <revision>"
  local key="$1"
  call "$ADMIN_S" -c \
    "SELECT campaign_id::text || ' ' || revision FROM public.save_talkx_campaign_draft(NULL, NULL, '$key'::uuid, '{\"name\":\"N102b\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\"}');"
}

echo "== N-102b passo 1 (vermelho no pré-estado): a vigente IGNORA send_weekdays no save =="
CID1="$(call "$ADMIN_S" -c \
  "SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, '{\"name\":\"N102b\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":[1,2,3,4,5]}');")"
GOT="$(call "$ADMIN_S" -c \
  "SELECT COALESCE(send_weekdays::text, '<NULL>') || '|' || respect_dnd::text FROM public.talkx_campaigns WHERE id = '$CID1'::uuid;")"
if [ "$GOT" = "{1,2,3,4,5}|true" ]; then
  echo "FALHOU: pré-estado já persiste send_weekdays (vermelho esperado)"; exit 1
fi
echo "VERMELHO confirmado no pré-estado (save ignorou; veio: $GOT)"
if [ "$SKIP_FIX" = "1" ]; then echo "SKIP_FIX=1: vermelho provado, pare aqui."; exit 1; fi
echo "== N-102b: aplica a migration REAL sobre as vigentes =="
docker exec -i "$CNAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q \
  -f /dev/stdin < "$MIGRATION" >/dev/null
echo "migration aplicada"
echo "== N-102b passo 1b (verde): save persiste [1..5] na ordem e respect_dnd=false =="
CID1B="$(call "$ADMIN_S" -c \
  "SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000101'::uuid, '{\"name\":\"N102b\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":[1,2,3,4,5],\"respect_dnd\":false}');")"
GOT="$(call "$ADMIN_S" -c \
  "SELECT send_weekdays::text || '|' || respect_dnd::text FROM public.talkx_campaigns WHERE id = '$CID1B'::uuid;")"
[ "$GOT" = "{1,2,3,4,5}|false" ] || { echo "FALHOU: save não persistiu [1..5]/false, veio: $GOT"; exit 1; }
echo "OK passo 1b"

echo "== N-102b passo 2: save recusa entrada inválida com 22023 (inclui [99999]) =="
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":[1,\"x\"]}');"
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000003'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":\"5\"}');"
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000004'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":[7]}');"
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000005'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":[99999]}');"
echo "OK passo 2: [1,\"x\"], \"5\", [7] e [99999] caem em 22023 no save"

echo "== N-102b passo 3: update persiste [0,6]; inválidos (inclui [99999]) caem em 22023 =="
read -r CID REV <<<"$(fresh_campaign bbbbbbbb-0000-4000-8000-000000000001)"
call "$ADMIN_S" -c \
  "SELECT * FROM public.update_talkx_campaign_limits('$CID'::uuid, $REV, '{\"send_weekdays\":[0,6]}');" >/dev/null
GOT="$(call "$ADMIN_S" -c \
  "SELECT send_weekdays::text FROM public.talkx_campaigns WHERE id = '$CID'::uuid;")"
[ "$GOT" = "{0,6}" ] || { echo "FALHOU: update não persistiu [0,6], veio: $GOT"; exit 1; }
for i in 1 2 3 4; do
  case $i in
    1) bad='[1,"x"]';; 2) bad='"5"';; 3) bad='[7]';; 4) bad='[99999]';;
  esac
  read -r C2 R2 <<<"$(fresh_campaign bbbbbbbb-0000-4000-8000-00000000020$i)"
  expect_code "$ADMIN_S" 22023 -c \
    "SELECT * FROM public.update_talkx_campaign_limits('$C2'::uuid, $R2, '{\"send_weekdays\":$bad}');"
done
echo "OK passo 3"

echo "== N-102b passo 4: X014 preservado — agent (não admin) recebe 42501 =="
expect_code "$AGENT_S" 42501 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000006'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\"}');"
read -r C3 R3 <<<"$(fresh_campaign bbbbbbbb-0000-4000-8000-000000000009)"
expect_code "$AGENT_S" 42501 -c \
  "SELECT * FROM public.update_talkx_campaign_limits('$C3'::uuid, $R3, '{\"max_per_minute\":2}');"
echo "OK passo 4: X014 ativo no save e no update"

echo "== N-102b passo 5: max_per_minute continua aceito no update; teto X018 ativo =="
read -r C4 R4 <<<"$(fresh_campaign bbbbbbbb-0000-4000-8000-000000000010)"
call "$ADMIN_S" -c \
  "SELECT * FROM public.update_talkx_campaign_limits('$C4'::uuid, $R4, '{\"max_per_minute\":3}');" >/dev/null
GOT="$(call "$ADMIN_S" -c \
  "SELECT max_per_minute::text FROM public.talkx_campaigns WHERE id = '$C4'::uuid;")"
[ "$GOT" = "3" ] || { echo "FALHOU: max_per_minute rejeitado ou não persistiu, veio: $GOT"; exit 1; }
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.update_talkx_campaign_limits('$C4'::uuid, $((R4 + 1)), '{\"max_per_minute\":7}');"
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000007'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"max_per_minute\":7}');"
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000008'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"respect_suppression\":false}');"
echo "OK passo 5: max_per_minute aceito; teto X018 e X017 intactos"

echo "== N-102b passo 6: respect_dnd=false faz round-trip no save e no update =="
CID6="$(call "$ADMIN_S" -c \
  "SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000009'::uuid, '{\"name\":\"N102b\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"respect_dnd\":false}');")"
GOT="$(call "$ADMIN_S" -c \
  "SELECT respect_dnd::text FROM public.talkx_campaigns WHERE id = '$CID6'::uuid;")"
[ "$GOT" = "false" ] || { echo "FALHOU: save não persistiu respect_dnd=false, veio: $GOT"; exit 1; }
read -r C5 R5 <<<"$(fresh_campaign bbbbbbbb-0000-4000-8000-000000000011)"
call "$ADMIN_S" -c \
  "SELECT * FROM public.update_talkx_campaign_limits('$C5'::uuid, $R5, '{\"respect_dnd\":false}');" >/dev/null
GOT="$(call "$ADMIN_S" -c \
  "SELECT respect_dnd::text FROM public.talkx_campaigns WHERE id = '$C5'::uuid;")"
[ "$GOT" = "false" ] || { echo "FALHOU: update não persistiu respect_dnd=false, veio: $GOT"; exit 1; }
echo "OK passo 6"

echo "== N-102b passo 7: ACL inalterada (anonimo/revogavel) =="
expect_code "" 42501 -c \
  "SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000010'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\"}');"
echo "OK passo 7"

echo "== N-102b passo 8: rollback executa e restaura as vigentes; migration reaplica =="
grep '^--   ' "$MIGRATION" | sed 's/^--   //' | \
  docker exec -i "$CNAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q -f /dev/stdin >/dev/null
HAS_WD="$(docker exec -i "$CNAME" psql -U postgres -d postgres -X -q -A -t \
  -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('save_talkx_campaign_draft','update_talkx_campaign_limits') AND p.prosrc LIKE '%send_weekdays%';")"
[ "$HAS_WD" = "0" ] || { echo "FALHOU: rollback não removeu send_weekdays das RPCs"; exit 1; }
read -r C6 R6 <<<"$(fresh_campaign bbbbbbbb-0000-4000-8000-000000000012)"
expect_code "$ADMIN_S" 22023 -c \
  "SELECT * FROM public.update_talkx_campaign_limits('$C6'::uuid, $R6, '{\"send_weekdays\":[0,6]}');"
CID8="$(call "$ADMIN_S" -c \
  "SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000011'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":[1,2]}');")"
GOT="$(call "$ADMIN_S" -c \
  "SELECT send_weekdays IS NULL FROM public.talkx_campaigns WHERE id = '$CID8'::uuid;")"
[ "$GOT" = "t" ] || { echo "FALHOU: rollback não restaurou o save vigente (ignorar send_weekdays)"; exit 1; }
docker exec -i "$CNAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q \
  -f /dev/stdin < "$MIGRATION" >/dev/null
CID9="$(call "$ADMIN_S" -c \
  "SELECT campaign_id FROM public.save_talkx_campaign_draft(NULL, NULL, 'aaaaaaaa-0000-4000-8000-000000000012'::uuid, '{\"name\":\"N\",\"message_template\":\"oi\",\"objective\":\"vendas\",\"audience_source\":\"contacts\",\"send_weekdays\":[6]}');")"
GOT="$(call "$ADMIN_S" -c \
  "SELECT send_weekdays::text FROM public.talkx_campaigns WHERE id = '$CID9'::uuid;")"
[ "$GOT" = "{6}" ] || { echo "FALHOU: reaplicação não restaurou o fix, veio: $GOT"; exit 1; }
echo "OK passo 8: rollback executável, vigentes restauradas, fix reaplicado"

echo "N-102b VERDE: send_weekdays persiste com 22023, proteções e rollback íntegros."
