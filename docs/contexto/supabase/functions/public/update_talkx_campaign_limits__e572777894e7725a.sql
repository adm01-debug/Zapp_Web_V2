CREATE OR REPLACE FUNCTION public.update_talkx_campaign_limits(p_campaign_id uuid, p_expected_revision bigint, p_limits jsonb)
 RETURNS TABLE(campaign_id uuid, revision bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
