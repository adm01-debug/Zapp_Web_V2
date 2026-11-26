CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs()
 RETURNS TABLE(jobname text, schedule text, active boolean, last_status text, last_run_at timestamp with time zone, last_return_message text, permitido boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'cron'
AS $function$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin_list_cron_jobs: acesso restrito a administradores'
      using errcode = '42501';
  end if;

  return query
  select j.jobname::text,
         j.schedule::text,
         j.active,
         d.status,
         d.start_time,
         left(coalesce(d.return_message, ''), 200),
         j.jobname = any (public.admin_cron_jobs_permitidos())
  from cron.job j
  left join lateral (
    select r.status, r.start_time, r.return_message
    from cron.job_run_details r
    where r.jobid = j.jobid
    order by r.start_time desc
    limit 1
  ) d on true
  order by j.jobname;
end;
$function$
