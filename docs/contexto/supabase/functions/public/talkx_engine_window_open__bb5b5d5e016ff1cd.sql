CREATE OR REPLACE FUNCTION public.talkx_engine_window_open(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tz         text;
  v_start      time;
  v_end        time;
  v_bh_only    boolean;
  v_local      timestamp;
  v_min        integer;
  v_bh         jsonb;
  v_days       jsonb;
  v_bstart     text;
  v_bend       text;
  v_bstart_min integer;
  v_bend_min   integer;
  v_dow        integer;
BEGIN
  -- M-DB-05: a janela de envio de QUALQUER campanha nao e dado de agente.
  IF NOT public.secd_caller_ok(NULL, true) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(NULLIF(c.schedule_timezone, ''), 'America/Sao_Paulo'),
         c.send_window_start,
         c.send_window_end,
         COALESCE(c.business_hours_only, false)
    INTO v_tz, v_start, v_end, v_bh_only
    FROM public.talkx_campaigns AS c
   WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_local := (now() AT TIME ZONE v_tz);
  v_min := EXTRACT(hour FROM v_local)::integer * 60 + EXTRACT(minute FROM v_local)::integer;

  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_min < EXTRACT(hour FROM v_start)::integer * 60 + EXTRACT(minute FROM v_start)::integer
       OR v_min >= EXTRACT(hour FROM v_end)::integer * 60 + EXTRACT(minute FROM v_end)::integer THEN
      RETURN false;
    END IF;
  END IF;

  IF v_bh_only THEN
    SELECT s.value INTO v_bh FROM public.talkx_settings AS s WHERE s.key = 'business_hours';
    v_days := COALESCE(v_bh -> 'days', '[1,2,3,4,5]'::jsonb);
    v_bstart := COALESCE(v_bh ->> 'start', '08:00');
    v_bend := COALESCE(v_bh ->> 'end', '18:00');
    v_dow := EXTRACT(dow FROM v_local)::integer;
    IF NOT (v_days @> to_jsonb(v_dow)) THEN
      RETURN false;
    END IF;
    v_bstart_min := split_part(v_bstart, ':', 1)::integer * 60 + split_part(v_bstart, ':', 2)::integer;
    v_bend_min := split_part(v_bend, ':', 1)::integer * 60 + split_part(v_bend, ':', 2)::integer;
    IF v_min < v_bstart_min OR v_min >= v_bend_min THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$
