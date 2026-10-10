-- Migration N-118: Talk X — send_weekdays + respect_dnd nas campanhas,
-- helper validate_talkx_send_weekdays (erro 22023), window_open no fuso da
-- campanha (DND só com opt-in) e novos campos nas RPCs vigentes save/update.

-- Rollback:
--   drop function if exists public.talkx_campaign_window_open(uuid, timestamptz);
--   drop function if exists public.validate_talkx_send_weekdays(jsonb, text);
--   alter table public.talkx_campaigns drop column if exists send_weekdays;
--   alter table public.talkx_campaigns drop column if exists respect_dnd;
--   -- Depois de derrubar as colunas, reaplicar as RPCs-fonte (versões sem N-118),
--   -- pois save/update referenciam as colunas:
--   --   supabase/migrations/20261002451230_talkx_owner_responsible_unify.sql
--   --   supabase/migrations/20261002551230_talkx_limits_ritmo.sql

-- 1) Colunas na tabela de campanhas.
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS send_weekdays smallint[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS respect_dnd boolean NOT NULL DEFAULT true;

-- 2a) Validador de send_weekdays (erro de domínio 22023, nunca 22P02).
CREATE OR REPLACE FUNCTION public.validate_talkx_send_weekdays(
  p_weekdays jsonb,
  p_error text
)
RETURNS smallint[]
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_out smallint[] := '{}';
  v_elem text;
  v_day integer;
BEGIN
  IF p_weekdays IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_weekdays) <> 'array' THEN
    RAISE EXCEPTION '%', p_error USING ERRCODE = '22023';
  END IF;
  FOR v_elem IN SELECT jsonb_array_elements_text(p_weekdays)
  LOOP
    BEGIN
      v_day := v_elem::integer;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION '%', p_error USING ERRCODE = '22023';
    END;
    IF v_day IS NULL OR v_day < 0 OR v_day > 6 THEN
      RAISE EXCEPTION '%', p_error USING ERRCODE = '22023';
    END IF;
    IF NOT (v_day::smallint = ANY(v_out)) THEN
      v_out := v_out || v_day::smallint;
    END IF;
  END LOOP;
  IF v_out = '{}' THEN
    RETURN NULL;
  END IF;
  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_talkx_send_weekdays(jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_talkx_send_weekdays(jsonb, text)
  TO authenticated;

-- 2b) Janela de envio por campanha (fuso dela; DND só com opt-in).
CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open(
  p_campaign_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE (allowed boolean, reason text, next_window timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_dnd_hours jsonb;
  v_weekday smallint;
  v_local_hour integer;
  v_local_minute integer;
  v_start_minutes integer;
  v_end_minutes integer;
BEGIN
  SELECT * INTO v_campaign
    FROM public.talkx_campaigns
   WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Dia da semana em UTC (0=dom, 6=sáb).
  v_weekday := EXTRACT(DOW FROM p_at)::smallint;

  -- 1) Verificar send_weekdays (null = todos os dias permitidos).
  IF v_campaign.send_weekdays IS NOT NULL THEN
    IF NOT (v_weekday = ANY(v_campaign.send_weekdays)) THEN
      RETURN QUERY SELECT false, 'outside_weekdays', NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  -- 2) Horário de não perturbar (talkx_settings.dnd_hours), SOMENTE quando a
  --    campanha optou (respect_dnd; default true). Domingos e feriados NÃO
  --    vêm do DND: pertencem ao business_hours. Formato:
  --    { "start": "HH:MM", "end": "HH:MM" }. DND malformado fecha a janela.
  IF COALESCE(v_campaign.respect_dnd, true) THEN
    SELECT value INTO v_dnd_hours
      FROM public.talkx_settings
     WHERE key = 'dnd_hours';

    IF v_dnd_hours IS NOT NULL THEN
      DECLARE
        v_dnd_start time;
        v_dnd_end time;
      BEGIN
        BEGIN
          v_dnd_start := NULLIF(v_dnd_hours ->> 'start', '')::time;
          v_dnd_end := NULLIF(v_dnd_hours ->> 'end', '')::time;
        EXCEPTION
          WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
            RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
            RETURN;
        END;

        -- DND start..end (fim exclusivo), só com início/fim válidos.
        IF v_dnd_start IS NOT NULL AND v_dnd_end IS NOT NULL THEN
          v_local_hour := EXTRACT(HOUR FROM p_at)::integer;
          v_local_minute := EXTRACT(MINUTE FROM p_at)::integer;
          v_start_minutes := EXTRACT(HOUR FROM v_dnd_start)::integer * 60
            + EXTRACT(MINUTE FROM v_dnd_start)::integer;
          v_end_minutes := EXTRACT(HOUR FROM v_dnd_end)::integer * 60
            + EXTRACT(MINUTE FROM v_dnd_end)::integer;
          IF (v_local_hour * 60 + v_local_minute) >= v_start_minutes
             AND (v_local_hour * 60 + v_local_minute) < v_end_minutes THEN
            RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
            RETURN;
          END IF;
        END IF;
      END;
    END IF;
  END IF;

  -- 3) Janela de envio (send_window_start..send_window_end) — mesma lógica
  --    que talkx-send usa para pausar no mid-loop.
  IF v_campaign.send_window_start IS NOT NULL AND v_campaign.send_window_end IS NOT NULL THEN
    DECLARE
      v_window_start_minutes integer;
      v_window_end_minutes integer;
      v_current_minutes integer;
    BEGIN
      v_window_start_minutes := EXTRACT(HOUR FROM v_campaign.send_window_start)::integer * 60
        + EXTRACT(MINUTE FROM v_campaign.send_window_start)::integer;
      v_window_end_minutes := EXTRACT(HOUR FROM v_campaign.send_window_end)::integer * 60
        + EXTRACT(MINUTE FROM v_campaign.send_window_end)::integer;
      v_current_minutes := EXTRACT(HOUR FROM p_at)::integer * 60 + EXTRACT(MINUTE FROM p_at)::integer;

      IF v_current_minutes < v_window_start_minutes OR v_current_minutes >= v_window_end_minutes THEN
        RETURN QUERY SELECT false, 'outside_send_window', NULL::timestamptz;
        RETURN;
      END IF;
    END;
  END IF;

  -- 4) Business hours only — mesma lógica que talkx-send usa.
  IF v_campaign.business_hours_only THEN
    DECLARE
      v_bh jsonb;
      v_bh_start time;
      v_bh_end time;
      v_bh_days jsonb;
      v_bh_tz text;
    BEGIN
      SELECT value INTO v_bh
        FROM public.talkx_settings
       WHERE key = 'business_hours';

      IF v_bh IS NOT NULL THEN
        v_bh_start := NULLIF(v_bh ->> 'start', '')::time;
        v_bh_end := NULLIF(v_bh ->> 'end', '')::time;
        v_bh_days := v_bh -> 'days';
        v_bh_tz := NULLIF(v_bh ->> 'tz', '');

        IF v_bh_start IS NOT NULL AND v_bh_end IS NOT NULL THEN
          -- Converter p_at para o fuso do business hours.
          DECLARE
            v_local_time time;
          BEGIN
            v_local_time := (p_at AT TIME ZONE COALESCE(v_bh_tz, 'America/Sao_Paulo'))::time;
            IF v_local_time < v_bh_start OR v_local_time >= v_bh_end THEN
              RETURN QUERY SELECT false, 'outside_business_hours', NULL::timestamptz;
              RETURN;
            END IF;
          END;
        END IF;

        IF v_bh_days IS NOT NULL AND jsonb_typeof(v_bh_days) = 'array' THEN
          IF NOT (v_weekday = ANY(v_bh_days::integer[])) THEN
            RETURN QUERY SELECT false, 'outside_business_hours', NULL::timestamptz;
            RETURN;
          END IF;
        END IF;
      END IF;
    END;
  END IF;

  -- Tudo passou: janela aberta.
  RETURN QUERY SELECT true, NULL::text, NULL::timestamptz;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  TO authenticated;

-- 3) save_talkx_campaign_draft vigente + novos campos.
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
  v_send_weekdays smallint[];
  v_respect_dnd boolean;
  v_respect_suppression boolean;
  v_confirm_consent boolean;
  v_draft_step integer;
  v_owner uuid;
  v_template_version_id uuid;
  v_requested_status text;
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

  -- X014: criar/editar rascunho é ato de admin/supervisor (o front já esconde o
  -- módulo do agente; aqui a barreira é do banco).
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 65536 THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_payload' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_payload ->> 'name'), '');
  -- X009: mensagem ausente/vazia é aceita enquanto o rascunho está em draft.
  v_message_template := COALESCE(p_payload ->> 'message_template', '');
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
  -- N-118: dias de envio e opt-out do DND. Fora do contrato levanta
  -- invalid_talkx_campaign_draft (22023); [] = irrestrito (NULL).
  v_send_weekdays := public.validate_talkx_send_weekdays(p_payload -> 'send_weekdays', 'invalid_talkx_campaign_draft');
  v_respect_dnd := COALESCE((p_payload ->> 'respect_dnd')::boolean, true);
  v_respect_suppression := COALESCE((p_payload ->> 'respect_suppression')::boolean, true);
  v_confirm_consent := COALESCE((p_payload ->> 'confirm_consent')::boolean, false);
  -- X009: passo do wizard, padrão 1 quando o payload não traz draft_step.
  v_draft_step := COALESCE(NULLIF(p_payload ->> 'draft_step', '')::integer, 1);
  v_owner := NULLIF(p_payload ->> 'owner', '')::uuid;
  v_template_version_id := NULLIF(p_payload ->> 'template_version_id', '')::uuid;
  v_requested_status := NULLIF(p_payload ->> 'status', '');

  -- Unificação owner × responsible_id: `owner` é o ÚNICO responsável. Ausente ->
  -- o próprio ator (perfil ativo, já validado acima). Antes, este papel era do
  -- `responsible_id`, que o front nunca enviava e caía no default do ator.
  IF v_owner IS NULL THEN
    v_owner := v_actor_profile_id;
  END IF;

  -- X017: ate a decisao N12 o contrato RECUSA desmarcar a supressao. A coluna
  -- existe desde a V21; o valor `false` simplesmente nao pode ser gravado ainda.
  IF v_respect_suppression IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_respect_suppression_false_nao_liberado' USING ERRCODE = '22023';
  END IF;

  -- X009: mensagem vazia permitida em draft (limite 4.096); objective/audience_source
  -- seguem obrigatórios (colunas NOT NULL no schema).
  IF v_name IS NULL OR length(v_name) > 200
     OR v_objective IS NULL OR v_audience_source IS NULL
     OR length(v_message_template) > 4096
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
     OR (v_draft_step < 1 OR v_draft_step > 4)
     OR (v_requested_status IS NOT NULL AND v_requested_status <> 'draft') THEN
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
      send_window_start, send_window_end, business_hours_only, send_weekdays, respect_dnd, speed_profile,
      typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
      respect_suppression, confirm_consent, draft_step, owner, template_version_id,
      status, created_by, draft_creation_key, revision, created_at, updated_at
    ) VALUES (
      v_name, v_message_template, v_description, v_objective, v_audience_source,
      v_audience_filters, v_segment_id, v_template_id, v_connection_id,
      v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone,
      v_window_start, v_window_end, v_business_hours_only, v_send_weekdays, v_respect_dnd, v_speed_profile,
      v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max,
      v_respect_suppression, v_confirm_consent, v_draft_step, v_owner, v_template_version_id,
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
       OR v_campaign.send_weekdays IS DISTINCT FROM v_send_weekdays
       OR v_campaign.respect_dnd IS DISTINCT FROM v_respect_dnd
       OR v_campaign.respect_suppression IS DISTINCT FROM v_respect_suppression
       OR v_campaign.confirm_consent IS DISTINCT FROM v_confirm_consent
       OR v_campaign.draft_step IS DISTINCT FROM v_draft_step
       OR v_campaign.owner IS DISTINCT FROM v_owner
       OR v_campaign.template_version_id IS DISTINCT FROM v_template_version_id
       OR v_campaign.speed_profile IS DISTINCT FROM v_speed_profile
       OR v_campaign.typing_delay_min IS DISTINCT FROM v_typing_delay_min
       OR v_campaign.typing_delay_max IS DISTINCT FROM v_typing_delay_max
       OR v_campaign.send_interval_min IS DISTINCT FROM v_send_interval_min
       OR v_campaign.send_interval_max IS DISTINCT FROM v_send_interval_max THEN
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
         send_weekdays = v_send_weekdays,
         respect_dnd = v_respect_dnd,
         respect_suppression = v_respect_suppression,
         confirm_consent = v_confirm_consent,
         draft_step = v_draft_step,
         owner = v_owner,
         template_version_id = v_template_version_id,
         speed_profile = v_speed_profile,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         status = COALESCE(v_requested_status, campaign.status),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = v_campaign.id
   RETURNING * INTO v_campaign;

  RETURN QUERY SELECT v_campaign.id, v_campaign.revision, false;
END;
$function$;

-- 4) update_talkx_campaign_limits vigente + novos campos.
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
  v_max_per_minute smallint;
  v_send_window_start time;
  v_send_window_end time;
  v_eff_start time;
  v_eff_end time;
  v_business_hours_only boolean;
  v_send_weekdays smallint[];
  v_respect_dnd boolean;
  v_before jsonb;
  v_after jsonb;
  v_pace record;
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

  -- X014: editar limites de campanha é ato de admin/supervisor.
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_campaign_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'object' OR pg_column_size(p_limits) > 8192 THEN
    RAISE EXCEPTION 'invalid_talkx_limits_payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_limits) AS k
     WHERE k NOT IN ('speed_profile','send_interval_min','send_interval_max',
                     'typing_delay_min','typing_delay_max','max_per_minute',
                     'send_window_start','send_window_end','business_hours_only',
                     'send_weekdays','respect_dnd')
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_field' USING ERRCODE = '22023';
  END IF;

  -- Conversões de tipo: erro de conversão vira contrato 22023.
  BEGIN
    v_max_per_minute := NULLIF(p_limits ->> 'max_per_minute', '')::smallint;
    v_send_window_start := NULLIF(p_limits ->> 'send_window_start', '')::time;
    v_send_window_end := NULLIF(p_limits ->> 'send_window_end', '')::time;
    v_business_hours_only := NULLIF(p_limits ->> 'business_hours_only', '')::boolean;
    v_respect_dnd := NULLIF(p_limits ->> 'respect_dnd', '')::boolean;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR SQLSTATE '22009' THEN
      RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END;

  -- N-118: send_weekdays fora do contrato levanta invalid_talkx_limits_values
  -- (22023), nunca o CAST cru; [] = irrestrito (NULL).
  v_send_weekdays := public.validate_talkx_send_weekdays(p_limits -> 'send_weekdays', 'invalid_talkx_limits_values');

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

  -- X018: deriva o ritmo do perfil, clampa valores fora da faixa. Perfil ausente
  -- no payload mantém o atual da campanha; intervalos ausentes derivam do perfil.
  v_pace := NULL;
  SELECT * INTO v_pace FROM public.talkx_resolve_speed_pace(
    CASE WHEN p_limits ? 'speed_profile' THEN NULLIF(p_limits ->> 'speed_profile', '') ELSE v_campaign.speed_profile END,
    NULLIF(p_limits ->> 'send_interval_min', '')::integer,
    NULLIF(p_limits ->> 'send_interval_max', '')::integer,
    NULLIF(p_limits ->> 'typing_delay_min', '')::integer,
    NULLIF(p_limits ->> 'typing_delay_max', '')::integer
  );
  v_speed_profile := v_pace.speed_profile;
  v_send_interval_min := v_pace.send_interval_min;
  v_send_interval_max := v_pace.send_interval_max;
  v_typing_delay_min := v_pace.typing_delay_min;
  v_typing_delay_max := v_pace.typing_delay_max;

  IF v_send_interval_min > v_send_interval_max
     OR v_typing_delay_min > v_typing_delay_max THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  -- X018: max_per_minute acima do teto por minuto da conexão -> 22023.
  IF v_max_per_minute IS NOT NULL
     AND v_max_per_minute > COALESCE((SELECT (settings.value)::text::integer
                                        FROM public.talkx_settings settings
                                       WHERE settings.key = 'max_per_minute_per_connection'), 6) THEN
    RAISE EXCEPTION 'talkx_max_per_minute_acima_do_teto' USING ERRCODE = '22023';
  END IF;

  -- Janela de envio EFETIVA (mesma lógica da V09b).
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
    'max_per_minute', v_campaign.max_per_minute,
    'send_window_start', v_campaign.send_window_start,
    'send_window_end', v_campaign.send_window_end,
    'business_hours_only', v_campaign.business_hours_only,
    'send_weekdays', v_campaign.send_weekdays,
    'respect_dnd', v_campaign.respect_dnd
  );

  PERFORM set_config('app.talkx_limits_write', 'on', true);

  UPDATE public.talkx_campaigns campaign
     SET speed_profile = v_speed_profile,
         send_interval_min = v_send_interval_min,
         send_interval_max = v_send_interval_max,
         typing_delay_min = v_typing_delay_min,
         typing_delay_max = v_typing_delay_max,
         max_per_minute = COALESCE(v_max_per_minute, campaign.max_per_minute),
         send_window_start = CASE WHEN p_limits ? 'send_window_start' THEN v_send_window_start ELSE campaign.send_window_start END,
         send_window_end = CASE WHEN p_limits ? 'send_window_end' THEN v_send_window_end ELSE campaign.send_window_end END,
         business_hours_only = COALESCE(v_business_hours_only, campaign.business_hours_only),
         send_weekdays = CASE WHEN p_limits ? 'send_weekdays' THEN v_send_weekdays ELSE campaign.send_weekdays END,
         respect_dnd = COALESCE(v_respect_dnd, campaign.respect_dnd),
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
    'max_per_minute', v_campaign.max_per_minute,
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
