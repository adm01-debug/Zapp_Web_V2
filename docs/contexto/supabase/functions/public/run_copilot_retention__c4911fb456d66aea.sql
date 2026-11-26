CREATE OR REPLACE FUNCTION public.run_copilot_retention(p_target_date date DEFAULT (CURRENT_DATE - 1))
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_linhas integer;
BEGIN
  WITH sessoes AS (
    SELECT s.id AS session_id, s.profile_id, s.brinde_meter, s.temperature
      FROM public.copilot_sessions s
     WHERE s.started_at >= p_target_date
       AND s.started_at <  p_target_date + 1
  ),
  por_perfil AS (
    SELECT profile_id,
           count(*)                                 AS sessions_opened,
           count(*) FILTER (WHERE brinde_meter = 6)  AS brinde_complete,
           avg(temperature)                          AS avg_temperature
      FROM sessoes
     GROUP BY profile_id
  ),
  ticks AS (
    SELECT se.profile_id, count(*) AS ticks_processed
      FROM sessoes se
      JOIN public.ai_jobs j
        ON j.payload->>'session_id' = se.session_id::text
       AND j.kind = 'copilot.tick'
       AND j.status = 'succeeded'
       AND j.available_at >= p_target_date
       AND j.available_at <  p_target_date + 1
     GROUP BY se.profile_id
  ),
  insights AS (
    SELECT se.profile_id, count(DISTINCT i.id) AS insights_gen
      FROM sessoes se
      JOIN public.copilot_insights i
        ON i.session_id = se.session_id
       AND i.created_at >= p_target_date
       AND i.created_at <  p_target_date + 1
     GROUP BY se.profile_id
  )
  INSERT INTO public.copilot_retention_aggregates (
    profile_id, agg_date, sessions_opened, ticks_processed, insights_gen,
    brinde_complete, avg_temperature, updated_at
  )
  SELECT pp.profile_id,
         p_target_date,
         pp.sessions_opened,
         coalesce(t.ticks_processed, 0),
         coalesce(i.insights_gen, 0),
         pp.brinde_complete,
         pp.avg_temperature,
         now()
    FROM por_perfil pp
    LEFT JOIN ticks t    ON t.profile_id = pp.profile_id
    LEFT JOIN insights i ON i.profile_id = pp.profile_id
  ON CONFLICT (profile_id, agg_date)
  DO UPDATE SET
    sessions_opened = EXCLUDED.sessions_opened,
    ticks_processed = EXCLUDED.ticks_processed,
    insights_gen    = EXCLUDED.insights_gen,
    brinde_complete = EXCLUDED.brinde_complete,
    avg_temperature = EXCLUDED.avg_temperature,
    updated_at      = now();

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RAISE NOTICE 'retencao copiloto %: % linha(s)', p_target_date, v_linhas;
END;
$function$
