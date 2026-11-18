CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs()
 RETURNS TABLE(jobname text, schedule text, active boolean, last_status text, last_run_at timestamp with time zone, last_return_message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'cron'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_list_cron_jobs: acesso restrito a administradores'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT j.jobname::text,
         j.schedule::text,
         j.active,
         d.status,
         d.start_time,
         left(coalesce(d.return_message, ''), 200)
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT r.status, r.start_time, r.return_message
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) d ON true
  WHERE j.jobname = ANY (public.admin_cron_jobs_permitidos())
  ORDER BY j.jobname;
END;
$function$
