CREATE OR REPLACE FUNCTION public.talkx_resolve_speed_pace(p_speed_profile text, p_send_interval_min integer, p_send_interval_max integer, p_typing_delay_min integer, p_typing_delay_max integer)
 RETURNS TABLE(speed_profile text, send_interval_min integer, send_interval_max integer, typing_delay_min integer, typing_delay_max integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_default_profile text;
  v_profiles jsonb;
  v_range jsonb;
  v_profile text;
  v_si_min integer;
  v_si_max integer;
  v_td_min integer;
  v_td_max integer;
BEGIN
  SELECT COALESCE(settings.value #>> '{}', 'moderate')
    INTO v_default_profile
    FROM public.talkx_settings settings
   WHERE settings.key = 'default_speed_profile';

  v_profile := COALESCE(NULLIF(p_speed_profile, ''), v_default_profile, 'moderate');

  SELECT COALESCE(settings.value, '{}'::jsonb)
    INTO v_profiles
    FROM public.talkx_settings settings
   WHERE settings.key = 'speed_profiles';

  v_range := v_profiles -> v_profile;
  IF v_range IS NULL THEN
    v_range := v_profiles -> 'moderate';
  END IF;

  v_si_min := COALESCE((v_range ->> 'send_interval_min')::integer, 8000);
  v_si_max := COALESCE((v_range ->> 'send_interval_max')::integer, 20000);
  v_td_min := COALESCE((v_range ->> 'typing_delay_min')::integer, 1500);
  v_td_max := COALESCE((v_range ->> 'typing_delay_max')::integer, 4000);

  -- Clamp monotônico: cada valor fica dentro de [min, max] do perfil. Defaults
  -- (quando o cliente não manda) caem no limite natural da faixa.
  RETURN QUERY
  SELECT
    v_profile,
    LEAST(GREATEST(COALESCE(p_send_interval_min, v_si_min), v_si_min), v_si_max),
    LEAST(GREATEST(COALESCE(p_send_interval_max, v_si_max), v_si_min), v_si_max),
    LEAST(GREATEST(COALESCE(p_typing_delay_min, v_td_min), v_td_min), v_td_max),
    LEAST(GREATEST(COALESCE(p_typing_delay_max, v_td_max), v_td_min), v_td_max);
END;
$function$
