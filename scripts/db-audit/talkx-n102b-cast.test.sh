#!/usr/bin/env bash
set -Eeuo pipefail

# N-102b (fatia de cast): prova, em PostgreSQL 17 descartavel, que as RPCs
# save_talkx_campaign_draft e update_talkx_campaign_limits convertem o campo
# send_weekdays por TEXTO, elemento a elemento, em vez do cast direto
# (jsonb -> smallint[]), e recusam entrada invalida com SQLSTATE 22023.
#
# Por que o cast direto quebra: no PostgreSQL NAO existe cast jsonb -> smallint[].
# A versao pre-correcao (jsonb -> 'send_weekdays')::smallint[] estoura 42846
# (cannot cast type jsonb to smallint[]) em QUALQUER valor, inclusive um array
# valido. A correcao valida o tipo/valor de cada elemento e converte via ::text,
# levantando 22023 para nao-inteiro, nao-array e dia fora de 0..6.
#
# Vermelho/Verde:
#   RED  : TALKX_N102B_SKIP_FIX=1 -> aplica SOMENTE os corpos pre-correcao
#          embutidos abaixo; o teste FALHA (42846 no caso valido, 42846 no lugar
#          de 22023 no caso invalido).
#   GREEN: aplica supabase/migrations/<n102b>_talkx_n102b_cast.sql; o teste PASSA.
# Os corpos pre-correcao abaixo sao copiados VERBATIM da migration-base do N-102
# (commit 2c186a48 / 20261009203548_talkx_campaigns_send_weekdays_dnd.sql, branch
# rejeitada v2/t-0c04d5b6), que nao faz parte desta branch -- por isso ficam
# embutidos aqui como pre-estado.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_N102B_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-n102b-cast-$RANDOM-$$"
test_password="talkx_n102b_test_only"
skip_fix="${TALKX_N102B_SKIP_FIX:-0}"
migration="$repo_root/supabase/migrations/20261011003006_talkx_n102b_cast.sql"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-n102b-cast-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration do N-102b nao existe: $migration"

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

# ---- fixture minimo (espelha o que as duas RPCs referenciam) ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;

CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE,
  role text NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);

CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user AND role IN ('admin','supervisor'))
$$;

CREATE FUNCTION public.is_valid_talkx_schedule_timezone(p_tz text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_tz IS NOT NULL AND length(btrim(p_tz)) > 0
$$;

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'connected',
  instance_id text
);
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb NOT NULL);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  message_template text,
  description text,
  objective text,
  audience_source text,
  audience_filters jsonb,
  segment_id uuid,
  template_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate',
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  send_weekdays smallint[] DEFAULT NULL,
  respect_dnd boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX talkx_campaigns_draft_key_uidx
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profiles(id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin');
SQL

# ---- pre-estado: corpos PRE-CORRECAO (cast direto jsonb -> smallint[]) ----
psql_test >/dev/null <<'PRE_FIX_SQL'
CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_creation_key uuid,
  p_payload jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint, creation_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_name text;
  v_message_template text;
  v_description text;
  v_objective text;
  v_audience_source text;
  v_audience_filters jsonb;
  v_segment_id uuid;
  v_template_id uuid;
  v_connection_id uuid;
  v_media_url text;
  v_media_type text;
  v_scheduled_at timestamptz;
  v_schedule_timezone text;
  v_window_start time;
  v_window_end time;
  v_speed_profile text;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_business_hours_only boolean;
  v_requested_status text;
  v_send_weekdays smallint[];
  v_respect_dnd boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
   FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  v_message_template := p_payload ->> 'message_template';
  v_description := p_payload ->> 'description';
  v_objective := p_payload ->> 'objective';
  v_audience_source := p_payload ->> 'audience_source';
  v_audience_filters := COALESCE(p_payload -> 'audience_filters', '{}'::jsonb);
  v_segment_id := NULLIF(p_payload ->> 'segment_id', '')::uuid;
  v_template_id := NULLIF(p_payload ->> 'template_id', '')::uuid;
  v_connection_id := NULLIF(p_payload ->> 'whatsapp_connection_id', '')::uuid;
  v_media_url := p_payload ->> 'media_url';
  v_media_type := p_payload ->> 'media_type';
  v_scheduled_at := NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz;
  v_schedule_timezone := COALESCE(NULLIF(p_payload ->> 'schedule_timezone', ''), 'America/Sao_Paulo');
  v_window_start := NULLIF(p_payload ->> 'send_window_start', '')::time;
  v_window_end := NULLIF(p_payload ->> 'send_window_end', '')::time;
  v_speed_profile := COALESCE(NULLIF(p_payload ->> 'speed_profile', ''), 'moderate');
  v_typing_delay_min := COALESCE(NULLIF(p_payload ->> 'typing_delay_min', '')::integer, 1500);
  v_typing_delay_max := COALESCE(NULLIF(p_payload ->> 'typing_delay_max', '')::integer, 4000);
  v_send_interval_min := COALESCE(NULLIF(p_payload ->> 'send_interval_min', '')::integer, 8000);
  v_send_interval_max := COALESCE(NULLIF(p_payload ->> 'send_interval_max', '')::integer, 20000);
  v_business_hours_only := COALESCE((p_payload ->> 'business_hours_only')::boolean, false);
  v_requested_status := NULLIF(p_payload ->> 'status', '');
  v_send_weekdays := (p_payload -> 'send_weekdays')::smallint[];
  v_respect_dnd := COALESCE((p_payload ->> 'respect_dnd')::boolean, true);

  IF v_name IS NULL OR length(v_name) > 200
     OR v_message_template IS NULL OR length(btrim(v_message_template)) = 0 OR length(v_message_template) > 65536
     OR (v_description IS NOT NULL AND length(v_description) > 4000)
     OR v_objective NOT IN ('vendas', 'engajamento', 'reativacao', 'relacionamento', 'pesquisa', 'institucional')
     OR v_audience_source NOT IN ('contacts', 'segment', 'crm360')
     OR jsonb_typeof(v_audience_filters) <> 'object'
     OR (v_audience_source = 'segment' AND v_segment_id IS NULL)
     OR (v_audience_source <> 'segment' AND v_segment_id IS NOT NULL)
     OR v_typing_delay_min < 0 OR v_typing_delay_min > v_typing_delay_max OR v_typing_delay_max > 60000
     OR v_send_interval_min < 0 OR v_send_interval_min > v_send_interval_max OR v_send_interval_max > 300000
     OR v_speed_profile NOT IN ('slow', 'moderate', 'fast')
     OR (v_media_url IS NOT NULL AND (length(v_media_url) > 8192 OR v_media_url !~ '^https://'))
     OR (v_media_type IS NOT NULL AND v_media_type NOT IN ('image', 'video', 'document', 'audio'))
     OR ((v_media_url IS NULL) <> (v_media_type IS NULL))
     OR public.is_valid_talkx_schedule_timezone(v_schedule_timezone) IS NOT TRUE
     OR ((v_window_start IS NULL) <> (v_window_end IS NULL))
     OR (v_window_start IS NOT NULL AND v_window_start >= v_window_end)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft')
     OR (v_send_weekdays IS NOT NULL AND (
       SELECT bool_or(n < 0 OR n > 6) FROM unnest(v_send_weekdays) AS n
     )) THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_draft' USING ERRCODE = '22023';
  END IF;

  IF v_connection_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.whatsapp_connections connection
        WHERE connection.id = v_connection_id
          AND connection.status = 'connected'
          AND NULLIF(btrim(connection.instance_id), '') IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'selected_whatsapp_connection_unavailable' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NULL THEN
    IF p_creation_key IS NULL THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.talkx_campaigns (
      name, message_template, description, objective, audience_source,
      audience_filters, segment_id, template_id, whatsapp_connection_id,
      media_url, media_type, scheduled_at, schedule_timezone,
      send_window_start, send_window_end, business_hours_only, speed_profile,
      typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
      send_weekdays, respect_dnd,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_send_weekdays, v_respect_dnd,
      'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now
    )
    ON CONFLICT (created_by, draft_creation_key) WHERE draft_creation_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_campaign;

    IF FOUND THEN
      RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
      RETURN;
    END IF;

    SELECT * INTO v_campaign
      FROM public.talkx_campaigns campaign
     WHERE campaign.created_by = v_actor_profile_id
       AND campaign.draft_creation_key = p_creation_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'talkx_draft_creation_recovery_failed' USING ERRCODE = '40001';
    END IF;

    IF v_campaign.name IS DISTINCT FROM v_name
       OR v_campaign.message_template IS DISTINCT FROM v_message_template
       OR v_campaign.description IS DISTINCT FROM v_description
       OR v_campaign.objective IS DISTINCT FROM v_objective
       OR v_campaign.audience_source IS DISTINCT FROM v_audience_source
       OR v_campaign.audience_filters IS DISTINCT FROM v_audience_filters
       OR v_campaign.segment_id IS DISTINCT FROM v_segment_id
       OR v_campaign.template_id IS DISTINCT FROM v_template_id
       OR v_campaign.whatsapp_connection_id IS DISTINCT FROM v_connection_id
       OR v_campaign.media_url IS DISTINCT FROM v_media_url
       OR v_campaign.media_type IS DISTINCT FROM v_media_type
       OR v_campaign.scheduled_at IS DISTINCT FROM v_scheduled_at
       OR v_campaign.schedule_timezone IS DISTINCT FROM v_schedule_timezone
       OR v_campaign.send_window_start IS DISTINCT FROM v_window_start
       OR v_campaign.send_window_end IS DISTINCT FROM v_window_end
       OR v_campaign.business_hours_only IS DISTINCT FROM v_business_hours_only
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max
       OR v_campaign.send_weekdays IS DISTINCT FROM v_send_weekdays
       OR v_campaign.respect_dnd IS DISTINCT FROM v_respect_dnd THEN
      RAISE EXCEPTION 'talkx_draft_creation_key_payload_conflict' USING ERRCODE = '40001';
    END IF;

    RETURN QUERY SELECT v_campaign.id, v_campaign.revision, true;
    RETURN;
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'talkx_draft_expected_revision_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'talkx_campaign_not_editable' USING ERRCODE = '55000';
  END IF;
  IF v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  UPDATE public.talkx_campaigns campaign
     SET name = v_name,
         message_template = v_message_template,
         description = v_description,
         objective = v_objective,
         audience_source = v_audience_source,
         audience_filters = v_audience_filters,
         segment_id = v_segment_id,
         template_id = v_template_id,
         whatsapp_connection_id = v_connection_id,
         media_url = v_media_url,
         media_type = v_media_type,
         scheduled_at = v_scheduled_at,
         schedule_timezone = v_schedule_timezone,
         send_window_start = v_window_start,
         send_window_end = v_window_end,
         business_hours_only = v_business_hours_only,
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         send_weekdays = v_send_weekdays,
         respect_dnd = v_respect_dnd,
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = p_campaign_id
     AND campaign.revision = p_expected_revision
   RETURNING * INTO v_campaign;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY SELECT p_campaign_id, v_campaign.revision, false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_talkx_campaign_limits(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_limits jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_speed_profile text;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_send_window_start time;
  v_send_window_end time;
  v_business_hours_only boolean;
  v_send_weekdays smallint[];
  v_respect_dnd boolean;
  v_eff_start time;
  v_eff_end time;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor_profile_id
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'object' OR pg_column_size(p_limits) > 8192 THEN
    RAISE EXCEPTION 'invalid_talkx_limits_payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_limits) AS k
     WHERE k NOT IN ('speed_profile','send_interval_min','send_interval_max',
                     'typing_delay_min','typing_delay_max','send_window_start',
                     'send_window_end','business_hours_only','send_weekdays','respect_dnd')
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_field' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_speed_profile := NULLIF(p_limits ->> 'speed_profile', '');
    v_send_interval_min := NULLIF(p_limits ->> 'send_interval_min', '')::integer;
    v_send_interval_max := NULLIF(p_limits ->> 'send_interval_max', '')::integer;
    v_typing_delay_min := NULLIF(p_limits ->> 'typing_delay_min', '')::integer;
    v_typing_delay_max := NULLIF(p_limits ->> 'typing_delay_max', '')::integer;
    v_send_window_start := NULLIF(p_limits ->> 'send_window_start', '')::time;
    v_send_window_end := NULLIF(p_limits ->> 'send_window_end', '')::time;
    v_business_hours_only := NULLIF(p_limits ->> 'business_hours_only', '')::boolean;
    v_send_weekdays := (p_limits -> 'send_weekdays')::smallint[];
    v_respect_dnd := COALESCE((p_limits ->> 'respect_dnd')::boolean, true);
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END;

  IF (v_speed_profile IS NOT NULL AND v_speed_profile NOT IN ('slow','moderate','fast'))
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_min < 1)
     OR (v_send_interval_max IS NOT NULL AND v_send_interval_max < 1)
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_max IS NOT NULL
         AND v_send_interval_min > v_send_interval_max)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_min < 0)
     OR (v_typing_delay_max IS NOT NULL AND v_typing_delay_max < 0)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_max IS NOT NULL
         AND v_typing_delay_min > v_typing_delay_max) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  IF (v_send_weekdays IS NOT NULL AND (
    SELECT bool_or(n < 0 OR n > 6) FROM unnest(v_send_weekdays) AS n
  )) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_campaign.created_by IS DISTINCT FROM v_actor_profile_id
     AND COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  v_eff_start := CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE v_campaign.send_window_start END;
  v_eff_end   := CASE WHEN p_limits ? 'send_window_end'   THEN v_send_window_end   ELSE v_campaign.send_window_end END;
  IF NOT (
    (v_eff_start IS NULL AND v_eff_end IS NULL)
    OR (v_eff_start IS NOT NULL AND v_eff_end IS NOT NULL AND v_eff_start < v_eff_end)
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  v_before := jsonb_build_object(
    'speed_profile', v_campaign.speed_profile,
    'send_interval_min', v_campaign.send_interval_min,
    'send_interval_max', v_campaign.send_interval_max,
    'typing_delay_min', v_campaign.typing_delay_min,
    'typing_delay_max', v_campaign.typing_delay_max,
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only,
    'send_weekdays', v_campaign.send_weekdays,
    'respect_dnd', v_campaign.respect_dnd
  );

  PERFORM set_config('app.talkx_limits_write', 'on', true);

  UPDATE public.talkx_campaigns campaign
     SET speed_profile = COALESCE(v_speed_profile, campaign.speed_profile),
         send_interval_min = COALESCE(v_send_interval_min, campaign.send_interval_min),
         send_interval_max = COALESCE(v_send_interval_max, campaign.send_interval_max),
         typing_delay_min = COALESCE(v_typing_delay_min, campaign.typing_delay_min),
         typing_delay_max = COALESCE(v_typing_delay_max, campaign.typing_delay_max),
         send_window_start = CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE campaign.send_window_start END,
         send_window_end = CASE WHEN p_limits ? 'send_window_end' THEN v_send_window_end ELSE campaign.send_window_end END,
         business_hours_only = COALESCE(v_business_hours_only, campaign.business_hours_only),
         send_weekdays = CASE WHEN p_limits ? 'send_weekdays' THEN v_send_weekdays ELSE campaign.send_weekdays END,
         respect_dnd = CASE WHEN p_limits ? 'respect_dnd' THEN v_respect_dnd ELSE campaign.respect_dnd END,
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = p_campaign_id
     AND campaign.revision = p_expected_revision
   RETURNING * INTO v_campaign;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  PERFORM set_config('app.talkx_limits_write', '', true);

  v_after := jsonb_build_object(
    'speed_profile', v_campaign.speed_profile,
    'send_interval_min', v_campaign.send_interval_min,
    'send_interval_max', v_campaign.send_interval_max,
    'typing_delay_min', v_campaign.typing_delay_min,
    'typing_delay_max', v_campaign.typing_delay_max,
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only,
    'send_weekdays', v_campaign.send_weekdays,
    'respect_dnd', v_campaign.respect_dnd
  );

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, actor_id, message)
  VALUES (p_campaign_id, 'limits_updated', v_actor_profile_id,
          jsonb_build_object('before', v_before, 'after', v_after)::text);

  RETURN QUERY SELECT p_campaign_id, v_campaign.revision;
END;
$function$;
PRE_FIX_SQL

# ACL espelhando a producao: so authenticated executa (sem PUBLIC/anon).
# A migracao do N-102b NAO reemite GRANT/REVOKE (CREATE OR REPLACE preserva a ACL).
psql_test >/dev/null <<'SQL'
REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_talkx_campaign_limits(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_talkx_campaign_limits(uuid, bigint, jsonb) TO authenticated;
SQL

if [[ "$skip_fix" == "1" ]]; then
  echo '[INFO] TALKX_N102B_SKIP_FIX=1: aplicando SOMENTE o pre-estado (sem a correcao do N-102b).'
else
  psql_test < "$migration" >/dev/null || fail 'migration do N-102b nao aplicou'
fi

admin_sub='aaaaaaaa-0000-0000-0000-000000000001'

# ---- 1) caso VALIDO: send_weekdays inteiro e salvo (e respect_dnd default true) ----
create_out="$(psql_test -Atq 2>&1 <<SQL || true
\set VERBOSITY verbose
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '${admin_sub}';
SELECT campaign_id FROM public.save_talkx_campaign_draft(
  NULL, NULL, 'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
  '{"name":"N102b","message_template":"Ola","objective":"vendas","audience_source":"contacts","schedule_timezone":"America/Sao_Paulo","send_weekdays":[1,2,3,4,5]}'::jsonb
);
COMMIT;
SQL
)"
camp_id="$(printf '%s\n' "$create_out" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
[[ -n "$camp_id" ]] || fail "save com send_weekdays inteiro NAO retornou campaign_id: $create_out"
[[ "$(psql_test -Atqc "SELECT send_weekdays::text FROM public.talkx_campaigns WHERE id='$camp_id'")" == '{1,2,3,4,5}' ]] \
  || fail 'save nao gravou send_weekdays={1,2,3,4,5} (ordem preservada)'
[[ "$(psql_test -Atqc "SELECT respect_dnd FROM public.talkx_campaigns WHERE id='$camp_id'")" == 't' ]] \
  || fail 'save deveria manter respect_dnd default true'

# ---- 2) caso INVALIDO no save: nao-inteiro, nao-array e fora de 0..6 -> 22023 ----
expect_save_22023() {
  local desc="$1" payload="$2" out
  out="$(psql_test -Atq 2>&1 <<SQL || true
\set VERBOSITY verbose
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '${admin_sub}';
SELECT campaign_id FROM public.save_talkx_campaign_draft(
  NULL, NULL, gen_random_uuid(),
  '{"name":"N102b","message_template":"Ola","objective":"vendas","audience_source":"contacts","schedule_timezone":"America/Sao_Paulo","send_weekdays":${payload}}'::jsonb
);
COMMIT;
SQL
)"
  printf '%s' "$out" | grep -q '22023' || fail "save ${desc} deveria recusar com 22023: $out"
}
expect_save_22023 'nao-inteiro ([1,"x"])' '[1,"x"]'
expect_save_22023 'nao-array ("5")' '"5"'
expect_save_22023 'fora de 0..6 ([7])' '[7]'

# ---- 3) update_talkx_campaign_limits: valido grava; invalido recusa 22023 ----
upd_out="$(psql_test -Atq 2>&1 <<SQL || true
\set VERBOSITY verbose
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '${admin_sub}';
SELECT campaign_id FROM public.update_talkx_campaign_limits(
  '${camp_id}', 1, '{"send_weekdays":[0,6]}'::jsonb
);
COMMIT;
SQL
)"
printf '%s' "$upd_out" | grep -q "${camp_id}" || fail "update valido de send_weekdays nao retornou a campanha: $upd_out"
[[ "$(psql_test -Atqc "SELECT send_weekdays::text FROM public.talkx_campaigns WHERE id='$camp_id'")" == '{0,6}' ]] \
  || fail 'update nao gravou send_weekdays={0,6}'

expect_update_22023() {
  local desc="$1" payload="$2" out
  out="$(psql_test -Atq 2>&1 <<SQL || true
\set VERBOSITY verbose
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '${admin_sub}';
SELECT campaign_id FROM public.update_talkx_campaign_limits(
  '${camp_id}', 2, '{"send_weekdays":${payload}}'::jsonb
);
COMMIT;
SQL
)"
  printf '%s' "$out" | grep -q '22023' || fail "update ${desc} deveria recusar com 22023: $out"
}
expect_update_22023 'nao-inteiro ([1,"x"])' '[1,"x"]'
expect_update_22023 'nao-array ("5")' '"5"'
expect_update_22023 'fora de 0..6 ([7])' '[7]'

# ---- 4) ACL: authenticated executa, anon NAO (a migration nao muda GRANT) ----
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)','EXECUTE')")" == 't' ]] \
  || fail 'authenticated deveria executar save_talkx_campaign_draft'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)','EXECUTE')")" == 'f' ]] \
  || fail 'anon NAO deveria executar save_talkx_campaign_draft'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','public.update_talkx_campaign_limits(uuid,bigint,jsonb)','EXECUTE')")" == 't' ]] \
  || fail 'authenticated deveria executar update_talkx_campaign_limits'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','public.update_talkx_campaign_limits(uuid,bigint,jsonb)','EXECUTE')")" == 'f' ]] \
  || fail 'anon NAO deveria executar update_talkx_campaign_limits'

printf '[OK] Talk X N-102b: send_weekdays convertido por texto nas duas RPCs; nao-inteiro/nao-array/fora de 0..6 recusados com 22023; ACL de authenticated inalterada.\n'
