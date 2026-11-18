CREATE OR REPLACE FUNCTION public.cleanup_link_preview_cache()
 RETURNS TABLE(deleted_count integer, remaining_count integer, table_size_bytes bigint, duration_ms integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_deleted INTEGER := 0;
  v_remaining INTEGER := 0;
  v_size BIGINT := 0;
  v_duration INTEGER := 0;
BEGIN
  -- Apenas cron (postgres) e service_role. Não existe call site no front.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' THEN
    RAISE EXCEPTION 'cleanup_link_preview_cache: operacao restrita a service_role';
  END IF;
  WITH d AS (
    DELETE FROM public.link_preview_cache WHERE expires_at < now() RETURNING 1
  ) SELECT COUNT(*) INTO v_deleted FROM d;
  SELECT COUNT(*) INTO v_remaining FROM public.link_preview_cache;
  SELECT pg_total_relation_size('public.link_preview_cache') INTO v_size;
  v_duration := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::INTEGER;
  INSERT INTO public.link_preview_cache_metrics(deleted_count, remaining_count, table_size_bytes, duration_ms)
  VALUES (v_deleted, v_remaining, v_size, v_duration);
  RETURN QUERY SELECT v_deleted, v_remaining, v_size, v_duration;
END;
$function$
