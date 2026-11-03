CREATE OR REPLACE FUNCTION public.purge_voice_command_logs(p_retention_days integer DEFAULT 90, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days integer := COALESCE(p_retention_days, 90);
  v_deleted integer;
  v_total bigint := 0;
  v_batches integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_days NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'invalid_voice_purge_days: %', p_retention_days USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_voice_purge_limit: %', p_limit USING ERRCODE = '22023';
  END IF;
  LOOP
    DELETE FROM public.voice_command_logs
     WHERE id IN (
       SELECT id FROM public.voice_command_logs
        WHERE created_at < now() - make_interval(days => v_days)
        ORDER BY created_at
        LIMIT p_limit
     );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    EXIT WHEN v_deleted = 0;
    v_total := v_total + v_deleted;
    v_batches := v_batches + 1;
    EXIT WHEN v_deleted < p_limit OR v_batches >= 100;
  END LOOP;
  RETURN jsonb_build_object('table','voice_command_logs','retention_days',v_days,'deleted',v_total,'batches',v_batches);
END;
$function$
