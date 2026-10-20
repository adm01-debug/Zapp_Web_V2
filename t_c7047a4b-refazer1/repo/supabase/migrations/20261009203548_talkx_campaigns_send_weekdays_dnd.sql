-- Talk X: dias da semana e "não perturbe" na janela de envio (N-102)
-- Adiciona send_weekdays e respect_dnd em talkx_campaigns,
-- setting dnd_hours em talkx_settings, atualiza RPCs e cria
-- talkx_campaign_window_open.
-- Rollback: desfaz TUDO (colunas, setting, funções).

-- Rollback (SQL executável, na ordem inversa):
--   drop function if exists public.talkx_campaign_window_open(uuid, timestamptz);
--   delete from public.talkx_settings where key = 'dnd_hours';
--   alter table public.talkx_campaigns drop column if exists send_weekdays;
--   alter table public.talkx_campaigns drop column if exists respect_dnd;
--   create or replace function public.save_talkx_campaign_draft(p_campaign_id uuid, p_expected_revision bigint, p_creation_key uuid, p_payload jsonb) returns table(campaign_id uuid, revision bigint, creation_replayed boolean) language plpgsql security definer set search_path = public, pg_temp as $$ declare v_actor_profile_id uuid; v_campaign public.talkx_campaigns%rowtype; v_now timestamptz := statement_timestamp(); v_name text; v_message_template text; v_description text; v_objective text; v_audience_source text; v_audience_filters jsonb; v_segment_id uuid; v_template_id uuid; v_connection_id uuid; v_media_url text; v_media_type text; v_scheduled_at timestamptz; v_schedule_timezone text; v_window_start time; v_window_end time; v_speed_profile text; v_typing_delay_min integer; v_typing_delay_max integer; v_send_interval_min integer; v_send_interval_max integer; v_business_hours_only boolean; v_requested_status text; begin if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if; select profile.id into v_actor_profile_id from public.profiles profile where profile.user_id = auth.uid() and profile.is_active = true limit 1 for share; if v_actor_profile_id is null then raise exception 'active_profile_not_found' using errcode = '42501'; end if; if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 65536 then raise exception 'invalid_talkx_campaign_payload' using errcode = '22023'; end if; v_name := nullif(btrim(p_payload ->> 'name'), ''); v_message_template := p_payload ->> 'message_template'; v_description := p_payload ->> 'description'; v_objective := p_payload ->> 'objective'; v_audience_source := p_payload ->> 'audience_source'; v_audience_filters := coalesce(p_payload -> 'audience_filters', '{}'::jsonb); v_segment_id := nullif(p_payload ->> 'segment_id', '')::uuid; v_template_id := nullif(p_payload ->> 'template_id', '')::uuid; v_connection_id := nullif(p_payload ->> 'whatsapp_connection_id', '')::uuid; v_media_url := p_payload ->> 'media_url'; v_media_type := p_payload ->> 'media_type'; v_scheduled_at := nullif(p_payload ->> 'scheduled_at', '')::timestamptz; v_schedule_timezone := coalesce(nullif(p_payload ->> 'schedule_timezone', ''), 'America/Sao_Paulo'); v_window_start := nullif(p_payload ->> 'send_window_start', '')::time; v_window_end := nullif(p_payload ->> 'send_window_end', '')::time; v_speed_profile := coalesce(nullif(p_payload ->> 'speed_profile', ''), 'moderate'); v_typing_delay_min := coalesce(nullif(p_payload ->> 'typing_delay_min', '')::integer, 1500); v_typing_delay_max := coalesce(nullif(p_payload ->> 'typing_delay_max', '')::integer, 4000); v_send_interval_min := coalesce(nullif(p_payload ->> 'send_interval_min', '')::integer, 8000); v_send_interval_max := coalesce(nullif(p_payload ->> 'send_interval_max', '')::integer, 20000); v_business_hours_only := coalesce((p_payload ->> 'business_hours_only')::boolean, false); v_requested_status := nullif(p_payload ->> 'status', ''); if v_name is null or length(v_name) > 200 or v_message_template is null or length(btrim(v_message_template)) = 0 or length(v_message_template) > 65536 or (v_description is not null and length(v_description) > 4000) or v_objective not in ('vendas','engajamento','reativacao','relacionamento','pesquisa','institucional') or v_audience_source not in ('contacts','segment','crm360') or jsonb_typeof(v_audience_filters) <> 'object' or (v_audience_source = 'segment' and v_segment_id is null) or (v_audience_source <> 'segment' and v_segment_id is not null) or v_typing_delay_min < 0 or v_typing_delay_min > v_typing_delay_max or v_typing_delay_max > 60000 or v_send_interval_min < 0 or v_send_interval_min > v_send_interval_max or v_send_interval_max > 300000 or v_speed_profile not in ('slow','moderate','fast') or (v_media_url is not null and (length(v_media_url) > 8192 or v_media_url !~ '^https://')) or (v_media_type is not null and v_media_type not in ('image','video','document','audio')) or ((v_media_url is null) <> (v_media_type is null)) or public.is_valid_talkx_schedule_timezone(v_schedule_timezone) is not true or ((v_window_start is null) <> (v_window_end is null)) or (v_window_start is not null and v_window_start >= v_window_end) or (v_requested_status is not null and v_requested_status <> 'draft') then raise exception 'invalid_talkx_campaign_draft' using errcode = '22023'; end if; if v_connection_id is not null and not exists (select 1 from public.whatsapp_connections connection where connection.id = v_connection_id and connection.status = 'connected' and nullif(btrim(connection.instance_id), '') is not null) then raise exception 'selected_whatsapp_connection_unavailable' using errcode = '22023'; end if; if p_campaign_id is null then if p_creation_key is null then raise exception 'talkx_draft_creation_key_required' using errcode = '22023'; end if; insert into public.talkx_campaigns (name, message_template, description, objective, audience_source, audience_filters, segment_id, template_id, whatsapp_connection_id, media_url, media_type, scheduled_at, schedule_timezone, send_window_start, send_window_end, business_hours_only, speed_profile, typing_delay_min, typing_delay_max, send_interval_min, send_interval_max, status, created_by, draft_creation_key, revision, created_at, updated_at) values (v_name, v_message_template, v_description, v_objective, v_audience_source, v_audience_filters, v_segment_id, v_template_id, v_connection_id, v_media_url, v_media_type, v_scheduled_at, v_schedule_timezone, v_window_start, v_window_end, v_business_hours_only, v_speed_profile, v_typing_delay_min, v_typing_delay_max, v_send_interval_min, v_send_interval_max, 'draft', v_actor_profile_id, p_creation_key, 1, v_now, v_now) on conflict (created_by, draft_creation_key) where draft_creation_key is not null do nothing returning * into v_campaign; if found then return query select v_campaign.id, v_campaign.revision, false; return; end if; select * into v_campaign from public.talkx_campaigns campaign where campaign.created_by = v_actor_profile_id and campaign.draft_creation_key = p_creation_key for update; if not found then raise exception 'talkx_draft_creation_recovery_failed' using errcode = '40001'; end if; if v_campaign.name is distinct from v_name or v_campaign.message_template is distinct from v_message_template or v_campaign.description is distinct from v_description or v_campaign.objective is distinct from v_objective or v_campaign.audience_source is distinct from v_audience_source or v_campaign.audience_filters is distinct from v_audience_filters or v_campaign.segment_id is distinct from v_segment_id or v_campaign.template_id is distinct from v_template_id or v_campaign.whatsapp_connection_id is distinct from v_connection_id or v_campaign.media_url is distinct from v_media_url or v_campaign.media_type is distinct from v_media_type or v_campaign.scheduled_at is distinct from v_scheduled_at or v_campaign.schedule_timezone is distinct from v_schedule_timezone or v_campaign.send_window_start is distinct from v_window_start or v_campaign.send_window_end is distinct from v_window_end or v_campaign.business_hours_only is distinct from v_business_hours_only or v_campaign.speed_profile is distinct from v_speed_profile or v_campaign.typing_delay_min is distinct from v_typing_delay_min or v_campaign.typing_delay_max is distinct from v_typing_delay_max or v_campaign.send_interval_min is distinct from v_send_interval_min or v_campaign.send_interval_max is distinct from v_send_interval_max then raise exception 'talkx_draft_creation_key_payload_conflict' using errcode = '40001'; end if; return query select v_campaign.id, v_campaign.revision, true; return; end if; if p_expected_revision is null or p_expected_revision < 1 then raise exception 'talkx_draft_expected_revision_required' using errcode = '22023'; end if; select * into v_campaign from public.talkx_campaigns campaign where campaign.id = p_campaign_id for update; if not found then raise exception 'talkx_campaign_not_found' using errcode = 'P0002'; end if; if v_campaign.created_by is distinct from v_actor_profile_id and coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true then raise exception 'talkx_campaign_not_authorized' using errcode = '42501'; end if; if v_campaign.status not in ('draft','scheduled') then raise exception 'talkx_campaign_not_editable' using errcode = '55000'; end if; if v_campaign.revision is distinct from p_expected_revision then raise exception 'talkx_campaign_stale_revision' using errcode = '40001'; end if; update public.talkx_campaigns campaign set name = v_name, message_template = v_message_template, description = v_description, objective = v_objective, audience_source = v_audience_source, audience_filters = v_audience_filters, segment_id = v_segment_id, template_id = v_template_id, whatsapp_connection_id = v_connection_id, media_url = v_media_url, media_type = v_media_type, scheduled_at = v_scheduled_at, schedule_timezone = v_schedule_timezone, send_window_start = v_window_start, send_window_end = v_window_end, business_hours_only = v_business_hours_only, speed_profile = v_speed_profile, typing_delay_min = v_typing_delay_min, typing_delay_max = v_typing_delay_max, send_interval_min = v_send_interval_min, send_interval_max = v_send_interval_max, status = coalesce(v_requested_status, campaign.status), revision = campaign.revision + 1, updated_at = v_now where campaign.id = v_campaign.id returning * into v_campaign; return query select v_campaign.id, v_campaign.revision, false; end; $function$;
--   create or replace function public.update_talkx_campaign_limits(p_campaign_id uuid, p_expected_revision bigint, p_limits jsonb) returns table(campaign_id uuid, revision bigint) language plpgsql security definer set search_path = public, pg_temp as $$ declare v_actor_profile_id uuid; v_campaign public.talkx_campaigns%rowtype; v_now timestamptz := statement_timestamp(); v_speed_profile text; v_send_interval_min integer; v_send_interval_max integer; v_typing_delay_min integer; v_typing_delay_max integer; v_send_window_start time; v_send_window_end time; v_eff_start time; v_eff_end time; v_business_hours_only boolean; v_before jsonb; v_after jsonb; begin if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if; select profile.id into v_actor_profile_id from public.profiles profile where profile.user_id = auth.uid() and profile.is_active = true limit 1 for share; if v_actor_profile_id is null then raise exception 'active_profile_not_found' using errcode = '42501'; end if; if p_limits is null or jsonb_typeof(p_limits) <> 'object' or pg_column_size(p_limits) > 8192 then raise exception 'invalid_talkx_limits_payload' using errcode = '22023'; end if; if exists (select 1 from jsonb_object_keys(p_limits) as k where k not in ('speed_profile','send_interval_min','send_interval_max','typing_delay_min','typing_delay_max','send_window_start','send_window_end','business_hours_only')) then raise exception 'invalid_talkx_limits_field' using errcode = '22023'; end if; begin v_speed_profile := nullif(p_limits ->> 'speed_profile', ''); v_send_interval_min := nullif(p_limits ->> 'send_interval_min', '')::integer; v_send_interval_max := nullif(p_limits ->> 'send_interval_max', '')::integer; v_typing_delay_min := nullif(p_limits ->> 'typing_delay_min', '')::integer; v_typing_delay_max := nullif(p_limits ->> 'typing_delay_max', '')::integer; v_send_window_start := nullif(p_limits ->> 'send_window_start', '')::time; v_send_window_end := nullif(p_limits ->> 'send_window_end', '')::time; v_business_hours_only := nullif(p_limits ->> 'business_hours_only', '')::boolean; exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception 'invalid_talkx_limits_values' using errcode = '22023'; end; if (v_speed_profile is not null and v_speed_profile not in ('slow','moderate','fast')) or (v_send_interval_min is not null and v_send_interval_min < 1) or (v_send_interval_max is not null and v_send_interval_max < 1) or (v_send_interval_min is not null and v_send_interval_max is not null and v_send_interval_min > v_send_interval_max) or (v_typing_delay_min is not null and v_typing_delay_min < 0) or (v_typing_delay_max is not null and v_typing_delay_max < 0) or (v_typing_delay_min is not null and v_typing_delay_max is not null and v_typing_delay_min > v_typing_delay_max) then raise exception 'invalid_talkx_limits_values' using errcode = '22023'; end if; select * into v_campaign from public.talkx_campaigns campaign where campaign.id = p_campaign_id for update; if not found then raise exception 'talkx_campaign_not_found' using errcode = 'P0002'; end if; if v_campaign.created_by is distinct from v_actor_profile_id and coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true then raise exception 'talkx_campaign_not_authorized' using errcode = '42501'; end if; if p_expected_revision is null or v_campaign.revision is distinct from p_expected_revision then raise exception 'talkx_campaign_stale_revision' using errcode = '40001'; end if; v_eff_start := case when p_limits ? 'send_window_start' then v_send_window_start else v_campaign.send_window_start end; v_eff_end := case when p_limits ? 'send_window_end' then v_send_window_end else v_campaign.send_window_end end; if not ((v_eff_start is null and v_eff_end is null) or (v_eff_start is not null and v_eff_end is not null and v_eff_start < v_eff_end)) then raise exception 'invalid_talkx_limits_values' using errcode = '22023'; end if; v_before := jsonb_build_object('speed_profile', v_campaign.speed_profile, 'send_interval_min', v_campaign.send_interval_min, 'send_interval_max', v_campaign.send_interval_max, 'typing_delay_min', v_campaign.typing_delay_min, 'typing_delay_max', v_campaign.typing_delay_max, 'send_window_start', v_campaign.send_window_start, 'send_window_end', v_campaign.send_window_end, 'business_hours_only', v_campaign.business_hours_only); perform set_config('app.talkx_limits_write', 'on', true); update public.talkx_campaigns campaign set speed_profile = coalesce(v_speed_profile, campaign.speed_profile), send_interval_min = coalesce(v_send_interval_min, campaign.send_interval_min), send_interval_max = coalesce(v_send_interval_max, campaign.send_interval_max), typing_delay_min = coalesce(v_typing_delay_min, campaign.typing_delay_min), typing_delay_max = coalesce(v_typing_delay_max, campaign.typing_delay_max), send_window_start = case when p_limits ? 'send_window_start' then v_send_window_start else campaign.send_window_start end, send_window_end = case when p_limits ? 'send_window_end' then v_send_window_end else campaign.send_window_end end, business_hours_only = coalesce(v_business_hours_only, campaign.business_hours_only), revision = campaign.revision + 1, updated_at = v_now where campaign.id = p_campaign_id and campaign.revision = p_expected_revision returning * into v_campaign; if not found then raise exception 'talkx_campaign_stale_revision' using errcode = '40001'; end if; perform set_config('app.talkx_limits_write', '', true); v_after := jsonb_build_object('speed_profile', v_campaign.speed_profile, 'send_interval_min', v_campaign.send_interval_min, 'send_interval_max', v_campaign.send_interval_max, 'typing_delay_min', v_campaign.typing_delay_min, 'typing_delay_max', v_campaign.typing_delay_max, 'send_window_start', v_campaign.send_window_start, 'send_window_end', v_campaign.send_window_end, 'business_hours_only', v_campaign.business_hours_only); insert into public.talkx_campaign_events (campaign_id, event_type, actor_id, message) values (p_campaign_id, 'limits_updated', v_actor_profile_id, jsonb_build_object('before', v_before, 'after', v_after)::text); return query select p_campaign_id, v_campaign.revision; end; $function$;

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS send_weekdays smallint[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS respect_dnd boolean NOT NULL DEFAULT true;

INSERT INTO public.talkx_settings (key, value, description)
VALUES ('dnd_hours',
        '{"start":"22:00","end":"08:00","sundays":true,"holidays":[]}',
        'Janela "não perturbe": envios só fora deste horário quando respect_dnd=true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

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

REVOKE ALL ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_talkx_campaign_draft(uuid, bigint, uuid, jsonb)
  TO authenticated;

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

REVOKE ALL ON FUNCTION public.update_talkx_campaign_limits(uuid, bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_talkx_campaign_limits(uuid, bigint, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open(
  p_campaign_id uuid,
  p_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campaign public.talkx_campaigns%ROWTYPE;
  v_dnd_hours jsonb;
  v_weekday integer;
  v_start_minutes integer;
  v_end_minutes integer;
  v_minutes_of_day integer;
BEGIN
  SELECT * INTO v_campaign
    FROM public.talkx_campaigns
   WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- send_weekdays: null = todos os dias; array = dias permitidos (0=dom, 6=sáb)
  IF v_campaign.send_weekdays IS NOT NULL THEN
    v_weekday := EXTRACT(ISODOW FROM p_at)::integer % 7;
    IF NOT (v_weekday = ANY(v_campaign.send_weekdays)) THEN
      RETURN false;
    END IF;
  END IF;

  -- DND: se respect_dnd=true, verifica se p_at está dentro da janela de não perturbe
  IF v_campaign.respect_dnd THEN
    SELECT value INTO v_dnd_hours
      FROM public.talkx_settings
     WHERE key = 'dnd_hours';

    IF v_dnd_hours IS NOT NULL AND jsonb_typeof(v_dnd_hours) = 'object' THEN
      v_minutes_of_day := EXTRACT(HOUR FROM p_at)::integer * 60
                          + EXTRACT(MINUTE FROM p_at)::integer;
      v_start_minutes := (split_part(v_dnd_hours ->> 'start', ':', 1))::integer * 60
                         + (split_part(v_dnd_hours ->> 'start', ':', 2))::integer;
      v_end_minutes := (split_part(v_dnd_hours ->> 'end', ':', 1))::integer * 60
                       + (split_part(v_dnd_hours ->> 'end', ':', 2))::integer;

      -- domingo: se sundays=false, DND não aplica (janela aberta)
      IF EXTRACT(DOW FROM p_at) = 0 AND (v_dnd_hours ->> 'sundays')::boolean = false THEN
        RETURN true;
      END IF;

      -- feriados
      IF jsonb_array_length(v_dnd_hours -> 'holidays') > 0 THEN
        IF p_at::date = ANY(v_dnd_hours -> 'holidays')::date[] THEN
          RETURN true;
        END IF;
      END IF;

      -- Janela DND: se start < end, verifica se está dentro; se start > end (cruza meia-noite), verifica se está fora do intervalo permitido
      IF v_start_minutes < v_end_minutes THEN
        IF v_minutes_of_day >= v_start_minutes AND v_minutes_of_day < v_end_minutes THEN
          RETURN false;
        END IF;
      ELSIF v_start_minutes > v_end_minutes THEN
        IF v_minutes_of_day >= v_start_minutes OR v_minutes_of_day < v_end_minutes THEN
          RETURN false;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_window_open(uuid, timestamptz)
  TO authenticated;
