DROP FUNCTION IF EXISTS public.run_copilot_retention()

CREATE OR REPLACE FUNCTION public.run_copilot_retention(p_target_date date DEFAULT (current_date - 1))
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

COMMENT ON FUNCTION public.run_copilot_retention(date) IS
  'CV-143 - agrega a retencao do copiloto RADAR de um dia (padrao: ontem); rodada pelo cron as 02:00 UTC.'

REVOKE ALL ON FUNCTION public.run_copilot_retention(date) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.run_copilot_retention(date) TO service_role

DO $$
DECLARE
  v_dia date;
BEGIN
  IF to_regclass('public.copilot_retention_aggregates') IS NULL THEN
    RETURN;
  END IF;
  FOR v_dia IN SELECT generate_series(current_date - 30, current_date - 1, interval '1 day')::date LOOP
    BEGIN
      PERFORM public.run_copilot_retention(v_dia);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill da retencao do copiloto falhou em %: %', v_dia, SQLERRM;
    END;
  END LOOP;
END;
$$

DROP POLICY IF EXISTS "admin_supervisor_retention" ON public.copilot_retention_aggregates

CREATE POLICY "admin_supervisor_retention" ON public.copilot_retention_aggregates
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

CREATE OR REPLACE FUNCTION public.recalcular_retencao_copiloto(p_dias integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dia   date;
  v_dias  integer := least(greatest(coalesce(p_dias, 7), 1), 90);
  v_total integer := 0;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'somente admin ou supervisor pode recalcular a retencao do copiloto'
      USING ERRCODE = '42501';
  END IF;

  FOR v_dia IN SELECT generate_series(current_date - v_dias, current_date, interval '1 day')::date LOOP
    PERFORM public.run_copilot_retention(v_dia);
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$

COMMENT ON FUNCTION public.recalcular_retencao_copiloto(integer) IS
  'CV-143 - recalcula a retencao do copiloto RADAR dos ultimos N dias (1 a 90); exclusivo de admin/supervisor.'

REVOKE ALL ON FUNCTION public.recalcular_retencao_copiloto(integer) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.recalcular_retencao_copiloto(integer) TO authenticated, service_role
