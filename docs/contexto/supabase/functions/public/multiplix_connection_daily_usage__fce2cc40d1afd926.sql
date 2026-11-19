CREATE OR REPLACE FUNCTION public.multiplix_connection_daily_usage(p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer;
  v_sent integer;
  v_day_start timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_connection' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE((settings.value)::text::integer, 0)
    INTO v_limit
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'daily_limit_per_connection';

  -- O teto e por dia local de Sao Paulo (mesma referencia do ADR-007 D2).
  v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';

  v_sent := public.talkx_multiplix_connection_sent_count(p_connection_id, v_day_start);

  RETURN jsonb_build_object(
    'limit', COALESCE(v_limit, 0),
    'sent', COALESCE(v_sent, 0),
    'remaining', GREATEST(COALESCE(v_limit, 0) - COALESCE(v_sent, 0), 0),
    'day_start', v_day_start
  );
END;
$function$
