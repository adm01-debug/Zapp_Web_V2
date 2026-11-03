CREATE OR REPLACE FUNCTION public.multiplix_dispatch_window_is_open(p_dispatch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch public.multiplix_dispatches%ROWTYPE;
  v_tz text;
  v_local timestamp;
  v_minutes integer;
  v_start integer;
  v_end integer;
BEGIN
  SELECT * INTO v_dispatch FROM public.multiplix_dispatches WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_tz := COALESCE(NULLIF(btrim(v_dispatch.schedule_timezone), ''), 'America/Sao_Paulo');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    RETURN false; -- fuso invalido fecha a janela (mesma decisao do helper TS)
  END IF;

  v_local := statement_timestamp() AT TIME ZONE v_tz;
  v_minutes := (extract(hour FROM v_local)::integer * 60) + extract(minute FROM v_local)::integer;

  IF v_dispatch.send_window_start IS NOT NULL AND v_dispatch.send_window_end IS NOT NULL THEN
    v_start := (extract(hour FROM v_dispatch.send_window_start)::integer * 60)
             + extract(minute FROM v_dispatch.send_window_start)::integer;
    v_end := (extract(hour FROM v_dispatch.send_window_end)::integer * 60)
           + extract(minute FROM v_dispatch.send_window_end)::integer;
    IF v_minutes < v_start OR v_minutes >= v_end THEN
      RETURN false;
    END IF;
  END IF;

  IF v_dispatch.business_hours_only THEN
    IF extract(isodow FROM v_local)::integer > 5
       OR extract(hour FROM v_local)::integer < 8
       OR extract(hour FROM v_local)::integer >= 18 THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$
