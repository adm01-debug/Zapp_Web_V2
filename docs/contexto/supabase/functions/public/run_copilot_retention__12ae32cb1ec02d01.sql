CREATE OR REPLACE FUNCTION public.run_copilot_retention()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_target_date date := current_date - 1;
BEGIN
  INSERT INTO public.copilot_retention_aggregates (
    profile_id,
    agg_date,
    sessions_opened,
    ticks_processed,
    insights_gen,
    brinde_complete,
    avg_temperature,
    updated_at
  )
  SELECT
    s.profile_id,
    v_target_date,
    COUNT(DISTINCT s.id)                                           AS sessions_opened,
    -- ticks_processed: ai_jobs de kind 'copilot_tick' enfileirados p/ a sessão no dia
    (SELECT COUNT(*)
       FROM public.ai_jobs j
      WHERE j.payload->>'session_id' = s.id::text
        AND j.kind = 'copilot_tick'
        AND j.available_at >= v_target_date
        AND j.available_at <  v_target_date + 1)                  AS ticks_processed,
    COUNT(DISTINCT i.id)                                           AS insights_gen,
    COUNT(DISTINCT s.id) FILTER (WHERE s.brinde_meter = 6)         AS brinde_complete,
    AVG(s.temperature)                                             AS avg_temperature
  FROM public.copilot_sessions s
  LEFT JOIN public.copilot_insights i
    ON i.session_id = s.id
   AND i.created_at >= v_target_date
   AND i.created_at <  v_target_date + 1
  WHERE s.started_at >= v_target_date
    AND s.started_at <  v_target_date + 1
  GROUP BY s.profile_id
  ON CONFLICT (profile_id, agg_date)
  DO UPDATE SET
    sessions_opened = EXCLUDED.sessions_opened,
    ticks_processed = EXCLUDED.ticks_processed,
    insights_gen    = EXCLUDED.insights_gen,
    brinde_complete = EXCLUDED.brinde_complete,
    avg_temperature = EXCLUDED.avg_temperature,
    updated_at      = now();
END;
$function$
