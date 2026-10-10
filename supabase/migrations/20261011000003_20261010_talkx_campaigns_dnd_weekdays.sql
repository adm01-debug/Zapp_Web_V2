-- Migration N-118: Talk X — dias da semana e "não perturbe"
-- Adiciona send_weekdays e respect_dnd a talkx_campaigns,
-- cria talkx_campaign_window_open(), e atualiza RPCs para aceitar os novos campos.

-- Rollback:
--   drop function if exists public.talkx_campaign_window_open;
--   alter table public.talkx_campaigns drop column if exists send_weekdays;
--   alter table public.talkx_campaigns drop column if exists respect_dnd;

-- 1) Colunas na tabela de campanhas.
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS send_weekdays smallint[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS respect_dnd boolean NOT NULL DEFAULT true;

-- 2) Função de checagem de janela de envio por campanha.
--    Retorna allowed=true se a campanha pode enviar em p_at,
--    respeitando send_weekdays, dnd_hours e business_hours_only.
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

  -- 2) Verificar DND hours (vindos de talkx_settings.dnd_hours).
  SELECT value INTO v_dnd_hours
    FROM public.talkx_settings
   WHERE key = 'dnd_hours';

  IF v_dnd_hours IS NOT NULL THEN
    -- DND configurado: verificar se p_at cai dentro do horário de não perturbar.
    -- Formato JSONB: { "start": "HH:MM", "end": "HH:MM", "sundays": boolean, "holidays": ["2026-01-01", ...] }
    DECLARE
      v_dnd_start time;
      v_dnd_end time;
      v_dnd_sundays boolean;
      v_dnd_holidays jsonb;
      v_date_date date;
      v_holiday text;
    BEGIN
      v_dnd_start := NULLIF(v_dnd_hours ->> 'start', '')::time;
      v_dnd_end := NULLIF(v_dnd_hours ->> 'end', '')::time;
      v_dnd_sundays := COALESCE((v_dnd_hours ->> 'sundays')::boolean, false);
      v_dnd_holidays := v_dnd_hours -> 'holidays';
      v_date_date := p_at::date;

      -- Domingo bloqueado?
      IF v_dnd_sundays AND v_weekday = 0 THEN
        RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
        RETURN;
      END IF;

      -- Feriado bloqueado?
      IF jsonb_array_length(v_dnd_holidays) > 0 THEN
        FOR v_holiday IN SELECT jsonb_array_elements_text(v_dnd_holidays)
        LOOP
          IF v_date_date = v_holiday::date THEN
            RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
            RETURN;
          END IF;
        END LOOP;
      END IF;

      -- Horário DND (start..end) bloqueado?
      IF v_dnd_start IS NOT NULL AND v_dnd_end IS NOT NULL THEN
        v_local_hour := EXTRACT(HOUR FROM p_at)::integer;
        v_local_minute := EXTRACT(MINUTE FROM p_at)::integer;
        v_start_minutes := v_dnd_start.hour * 60 + v_dnd_start.minute;
        v_end_minutes := v_dnd_end.hour * 60 + v_dnd_end.minute;
        IF (v_local_hour * 60 + v_local_minute) BETWEEN v_start_minutes AND v_end_minutes THEN
          RETURN QUERY SELECT false, 'dnd', NULL::timestamptz;
          RETURN;
        END IF;
      END IF;
    END;
  END IF;

  -- 3) Janela de envio (send_window_start..send_window_end) — mesma lógica
  --    que talkx-send usa para pausar no mid-loop.
  IF v_campaign.send_window_start IS NOT NULL AND v_campaign.send_window_end IS NOT NULL THEN
    DECLARE
      v_window_start_minutes integer;
      v_window_end_minutes integer;
      v_current_minutes integer;
    BEGIN
      v_window_start_minutes := v_campaign.send_window_start.hour * 60 + v_campaign.send_window_start.minute;
      v_window_end_minutes := v_campaign.send_window_end.hour * 60 + v_campaign.send_window_end.minute;
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

-- 3) Atualizar save_talkx_campaign_draft para aceitar send_weekdays e respect_dnd.
CREATE OR REPLACE FUNCTION public.save_talkx_campaign_draft(
  p_campaign_id uuid,
  p_expected_revision bigint,
  p_payload jsonb
)
RETURNS TABLE(campaign_id uuid, revision bigint, created boolean)
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
  v_whatsapp_connection_id uuid;
  v_media_url text;
  v_media_type text;
  v_scheduled_at timestamptz;
  v_schedule_timezone text;
  v_window_start time;
  v_window_end time;
  v_business_hours_only boolean;
  v_speed_profile text;
  v_typing_delay_min integer;
  v_typing_delay_max integer;
  v_send_interval_min integer;
  v_send_interval_max integer;
  v_send_weekdays smallint[];
  v_respect_dnd boolean;
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

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 8192 THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) AS k
     WHERE k NOT IN ('name','message_template','description','objective','audience_source',
                     'audience_filters','segment_id','template_id','whatsapp_connection_id',
                     'media_url','media_type','scheduled_at','schedule_timezone',
                     'send_window_start','send_window_end','business_hours_only',
                     'speed_profile','typing_delay_min','typing_delay_max',
                     'send_interval_min','send_interval_max','requested_status',
                     'send_weekdays','respect_dnd')
  ) THEN
    RAISE EXCEPTION 'invalid_talkx_payload_field' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(p_payload ->> 'name', '');
  v_message_template := NULLIF(p_payload ->> 'message_template', '');
  v_description := NULLIF(p_payload ->> 'description', '');
  v_objective := NULLIF(p_payload ->> 'objective', '');
  v_audience_source := NULLIF(p_payload ->> 'audience_source', '');
  v_audience_filters := p_payload -> 'audience_filters';
  v_segment_id := p_payload ->> 'segment_id';
  v_template_id := p_payload ->> 'template_id';
  v_whatsapp_connection_id := p_payload ->> 'whatsapp_connection_id';
  v_media_url := NULLIF(p_payload ->> 'media_url', '');
  v_media_type := NULLIF(p_payload ->> 'media_type', '');
  v_scheduled_at := NULLIF(p_payload ->> 'scheduled_at', '')::timestamptz;
  v_schedule_timezone := NULLIF(p_payload ->> 'schedule_timezone', '');
  v_window_start := NULLIF(p_payload ->> 'send_window_start', '')::time;
  v_window_end := NULLIF(p_payload ->> 'send_window_end', '')::time;
  v_business_hours_only := (p_payload ->> 'business_hours_only')::boolean;
  v_speed_profile := NULLIF(p_payload ->> 'speed_profile', '');
  v_typing_delay_min := NULLIF(p_payload ->> 'typing_delay_min', '')::integer;
  v_typing_delay_max := NULLIF(p_payload ->> 'typing_delay_max', '')::integer;
  v_send_interval_min := NULLIF(p_payload ->> 'send_interval_min', '')::integer;
  v_send_interval_max := NULLIF(p_payload ->> 'send_interval_max', '')::integer;
  v_send_weekdays := p_payload -> 'send_weekdays';
  v_respect_dnd := (p_payload ->> 'respect_dnd')::boolean;
  v_requested_status := NULLIF(p_payload ->> 'requested_status', '');

  IF (v_window_start IS NULL) <> (v_window_end IS NULL) THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_window_start IS NOT NULL AND v_window_start >= v_window_end THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_send_interval_min IS NOT NULL AND v_send_interval_min < 1 THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_send_interval_max IS NOT NULL AND v_send_interval_max < 1 THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_send_interval_min IS NOT NULL AND v_send_interval_max IS NOT NULL
     AND v_send_interval_min > v_send_interval_max THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_typing_delay_min IS NOT NULL AND v_typing_delay_min < 0 THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_typing_delay_max IS NOT NULL AND v_typing_delay_max < 0 THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_typing_delay_min IS NOT NULL AND v_typing_delay_max IS NOT NULL
     AND v_typing_delay_min > v_typing_delay_max THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_speed_profile IS NOT NULL AND v_speed_profile NOT IN ('slow','moderate','fast') THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_send_weekdays IS NOT NULL AND jsonb_typeof(v_send_weekdays) <> 'array' THEN
    RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
  END IF;
  IF v_send_weekdays IS NOT NULL THEN
    DECLARE
      v_wd integer;
    BEGIN
      FOR v_wd IN SELECT jsonb_array_elements_text(v_send_weekdays)::integer
      LOOP
        IF v_wd < 0 OR v_wd > 6 THEN
          RAISE EXCEPTION 'invalid_talkx_payload' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END;
  END IF;

  -- Upsert: se campaign_id é uuid nil, cria; senão, atualiza.
  IF p_campaign_id IS NULL OR p_campaign_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    INSERT INTO public.talkx_campaigns (
      created_by, name, message_template, description, objective,
      audience_source, audience_filters, segment_id, template_id,
      whatsapp_connection_id, media_url, media_type, scheduled_at,
      schedule_timezone, send_window_start, send_window_end,
      business_hours_only, speed_profile, typing_delay_min, typing_delay_max,
      send_interval_min, send_interval_max, send_weekdays, respect_dnd
    ) VALUES (
      v_actor_profile_id, v_name, v_message_template, v_description, v_objective,
      v_audience_source, v_audience_filters, v_segment_id, v_template_id,
      v_whatsapp_connection_id, v_media_url, v_media_type, v_scheduled_at,
      v_schedule_timezone, v_window_start, v_window_end,
      v_business_hours_only, v_speed_profile, v_typing_delay_min, v_typing_delay_max,
      v_send_interval_min, v_send_interval_max, v_send_weekdays, v_respect_dnd
    )
    RETURNING id, revision INTO campaign_id, revision;
    RETURN QUERY SELECT campaign_id, revision, true;
    RETURN;
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
  IF p_expected_revision IS NULL OR v_campaign.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'talkx_campaign_stale_revision' USING ERRCODE = '40001';
  END IF;

  UPDATE public.talkx_campaigns campaign
     SET name = COALESCE(v_name, campaign.name),
         message_template = COALESCE(v_message_template, campaign.message_template),
         description = COALESCE(v_description, campaign.description),
         objective = COALESCE(v_objective, campaign.objective),
         audience_source = COALESCE(v_audience_source, campaign.audience_source),
         audience_filters = COALESCE(v_audience_filters, campaign.audience_filters),
         segment_id = COALESCE(v_segment_id, campaign.segment_id),
         template_id = COALESCE(v_template_id, campaign.template_id),
         whatsapp_connection_id = COALESCE(v_whatsapp_connection_id, campaign.whatsapp_connection_id),
         media_url = COALESCE(v_media_url, campaign.media_url),
         media_type = COALESCE(v_media_type, campaign.media_type),
         scheduled_at = COALESCE(v_scheduled_at, campaign.scheduled_at),
         schedule_timezone = COALESCE(v_schedule_timezone, campaign.schedule_timezone),
         send_window_start = COALESCE(v_window_start, campaign.send_window_start),
         send_window_end = COALESCE(v_window_end, campaign.send_window_end),
         business_hours_only = COALESCE(v_business_hours_only, campaign.business_hours_only),
         speed_profile = COALESCE(v_speed_profile, campaign.speed_profile),
         typing_delay_min = COALESCE(v_typing_delay_min, campaign.typing_delay_min),
         typing_delay_max = COALESCE(v_typing_delay_max, campaign.typing_delay_max),
         send_interval_min = COALESCE(v_send_interval_min, campaign.send_interval_min),
         send_interval_max = COALESCE(v_send_interval_max, campaign.send_interval_max),
         send_weekdays = COALESCE(v_send_weekdays, campaign.send_weekdays),
         respect_dnd = COALESCE(v_respect_dnd, campaign.respect_dnd),
         status = COALESCE(v_requested_status, campaign.status),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = v_campaign.id
   RETURNING id, revision INTO campaign_id, revision;

  RETURN QUERY SELECT campaign_id, revision, false;
END;
$function$;

-- 4) Atualizar update_talkx_campaign_limits para aceitar send_weekdays e respect_dnd.
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

  v_speed_profile := NULLIF(p_limits ->> 'speed_profile', '');
  v_send_interval_min := NULLIF(p_limits ->> 'send_interval_min', '')::integer;
  v_send_interval_max := NULLIF(p_limits ->> 'send_interval_max', '')::integer;
  v_typing_delay_min := NULLIF(p_limits ->> 'typing_delay_min', '')::integer;
  v_typing_delay_max := NULLIF(p_limits ->> 'typing_delay_max', '')::integer;
  v_send_window_start := NULLIF(p_limits ->> 'send_window_start', '')::time;
  v_send_window_end := NULLIF(p_limits ->> 'send_window_end', '')::time;
  v_business_hours_only := (p_limits ->> 'business_hours_only')::boolean;
  v_send_weekdays := p_limits -> 'send_weekdays';
  v_respect_dnd := (p_limits ->> 'respect_dnd')::boolean;

  IF (v_speed_profile IS NOT NULL AND v_speed_profile NOT IN ('slow','moderate','fast'))
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_min < 1)
     OR (v_send_interval_max IS NOT NULL AND v_send_interval_max < 1)
     OR (v_send_interval_min IS NOT NULL AND v_send_interval_max IS NOT NULL
         AND v_send_interval_min > v_send_interval_max)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_min < 0)
     OR (v_typing_delay_max IS NOT NULL AND v_typing_delay_max < 0)
     OR (v_typing_delay_min IS NOT NULL AND v_typing_delay_max IS NOT NULL
         AND v_typing_delay_min > v_typing_delay_max)
     OR ((v_send_window_start IS NULL) <> (v_send_window_end IS NULL))
     OR (v_send_window_start IS NOT NULL AND v_send_window_start >= v_send_window_end) THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  IF v_send_weekdays IS NOT NULL AND jsonb_typeof(v_send_weekdays) <> 'array' THEN
    RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
  END IF;

  IF v_send_weekdays IS NOT NULL THEN
    DECLARE
      v_wd integer;
    BEGIN
      FOR v_wd IN SELECT jsonb_array_elements_text(v_send_weekdays)::integer
      LOOP
        IF v_wd < 0 OR v_wd > 6 THEN
          RAISE EXCEPTION 'invalid_talkx_limits_values' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END;
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

  UPDATE public.talkx_campaigns campaign
     SET speed_profile = COALESCE(v_speed_profile, campaign.speed_profile),
         send_interval_min = COALESCE(v_send_interval_min, campaign.send_interval_min),
         send_interval_max = COALESCE(v_send_interval_max, campaign.send_interval_max),
         typing_delay_min = COALESCE(v_typing_delay_min, campaign.typing_delay_min),
         typing_delay_max = COALESCE(v_typing_delay_max, campaign.typing_delay_max),
         send_window_start = COALESCE(v_send_window_start, campaign.send_window_start),
         send_window_end = COALESCE(v_send_window_end, campaign.send_window_end),
         business_hours_only = COALESCE(v_business_hours_only, campaign.business_hours_only),
         send_weekdays = COALESCE(v_send_weekdays, campaign.send_weekdays),
         respect_dnd = COALESCE(v_respect_dnd, campaign.respect_dnd),
         revision = campaign.revision + 1,
         updated_at = v_now
   WHERE campaign.id = v_campaign.id
   RETURNING id, revision INTO campaign_id, revision;

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

  INSERT INTO public.talkx_audit_log (campaign_id, actor_profile_id, action, before_state, after_state, occurred_at)
  VALUES (p_campaign_id, v_actor_profile_id, 'limits_updated', v_before, v_after, v_now);

  RETURN QUERY SELECT campaign_id, revision;
END;
$function$;