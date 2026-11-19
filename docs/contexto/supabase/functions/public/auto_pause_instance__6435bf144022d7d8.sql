CREATE OR REPLACE FUNCTION public.auto_pause_instance(p_instance text, p_minutes integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_row public.instance_pauses;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'somente_service_role' USING ERRCODE = '42501';
  END IF;

  IF p_instance IS NULL OR btrim(p_instance) = '' THEN
    RAISE EXCEPTION 'instancia_invalida' USING ERRCODE = '22023';
  END IF;

  IF p_minutes IS NULL OR p_minutes < 5 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'minutos_fora_da_faixa_5_1440' USING ERRCODE = '22023';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = '22023';
  END IF;

  UPDATE public.instance_pauses
     SET resumed_at = paused_until
   WHERE instance = btrim(p_instance)
     AND resumed_at IS NULL
     AND paused_until <= now();

  INSERT INTO public.instance_pauses AS ip (instance, paused_until, reason, paused_by, auto)
  VALUES (
    btrim(p_instance),
    now() + make_interval(mins => p_minutes),
    btrim(p_reason),
    NULL,
    true
  )
  ON CONFLICT (instance) WHERE resumed_at IS NULL
  DO UPDATE SET
    paused_until = greatest(ip.paused_until, EXCLUDED.paused_until),
    reason       = EXCLUDED.reason
  RETURNING ip.* INTO v_row;

  RETURN to_jsonb(v_row);
END;
$function$
