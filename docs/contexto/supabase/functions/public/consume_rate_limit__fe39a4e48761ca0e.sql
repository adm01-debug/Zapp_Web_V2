CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)
 RETURNS TABLE(allowed boolean, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.edge_rate_limits AS r (key, window_start, hits, updated_at)
  VALUES (p_key, now(), 1, now())
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE
          WHEN r.window_start + make_interval(secs => p_window_seconds) <= now() THEN 1
          ELSE r.hits + 1
        END,
        window_start = CASE
          WHEN r.window_start + make_interval(secs => p_window_seconds) <= now() THEN now()
          ELSE r.window_start
        END,
        updated_at = now()
  RETURNING r.hits INTO v_hits;

  RETURN QUERY SELECT v_hits <= p_max, GREATEST(p_max - v_hits, 0);
END;
$function$
