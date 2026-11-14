CREATE OR REPLACE FUNCTION public.is_within_business_hours(connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_day INTEGER;
  v_current_time TIME;
  v_is_open BOOLEAN;
  v_open_at TIME;
  v_close_at TIME;
BEGIN
  IF NOT public.secd_caller_ok(NULL, false) THEN
    RAISE EXCEPTION 'is_within_business_hours: chamador sem sessao de usuario'
      USING ERRCODE = '42501';
  END IF;

  -- Get current day of week (0=Sunday) and time in Brazil timezone
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (now() AT TIME ZONE 'America/Sao_Paulo')::TIME;

  -- Check business hours for this day
  SELECT bh.is_open, bh.open_time, bh.close_time
  INTO v_is_open, v_open_at, v_close_at
  FROM public.business_hours bh
  WHERE bh.whatsapp_connection_id = connection_id
  AND bh.day_of_week = v_current_day;

  -- If no configuration found, assume open (default behavior)
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- If marked as closed
  IF NOT v_is_open THEN
    RETURN false;
  END IF;

  -- Sem janela configurada: comparacao com NULL (comportamento anterior preservado)
  IF v_open_at IS NULL OR v_close_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- Janela que vira a noite (ex.: 18:00 -> 02:00): aberta de open_time ate a
  -- meia-noite OU da meia-noite ate close_time (close_time exclusivo).
  IF v_open_at > v_close_at THEN
    RETURN v_current_time >= v_open_at OR v_current_time < v_close_at;
  END IF;

  -- Check if current time is within open hours (close_time exclusivo: no minuto
  -- do fechamento a casa ja esta fechada)
  RETURN v_current_time >= v_open_at AND v_current_time < v_close_at;
END;
$function$

REVOKE EXECUTE ON FUNCTION public.is_within_business_hours(uuid) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.is_within_business_hours(uuid) TO authenticated, service_role
