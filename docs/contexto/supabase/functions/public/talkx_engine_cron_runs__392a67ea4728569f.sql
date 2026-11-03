CREATE OR REPLACE FUNCTION public.talkx_engine_cron_runs(p_limit integer DEFAULT 60)
 RETURNS TABLE(runid bigint, jobid bigint, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_jobid bigint;
  v_limit integer;
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''talkx-scheduler-1min'' LIMIT 1' INTO v_jobid;
  END IF;
  IF v_jobid IS NULL OR to_regclass('cron.job_run_details') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT runid, jobid, status, return_message, start_time, end_time
       FROM cron.job_run_details
      WHERE jobid = %L
      ORDER BY start_time DESC NULLS LAST, runid DESC
      LIMIT %s', v_jobid, v_limit);
END;
$function$
