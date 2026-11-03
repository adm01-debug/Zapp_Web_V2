CREATE OR REPLACE FUNCTION public.heartbeat_ai_job(p_id uuid, p_lease_token uuid, p_lease_seconds integer DEFAULT 90)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_id is null or p_lease_token is null then
    raise exception 'invalid_ai_job_heartbeat' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid_ai_job_lease' using errcode = '22023';
  end if;

  update public.ai_jobs as job
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(),
         updated_at = now()
   where job.id = p_id
     and job.lease_token = p_lease_token
     and job.status in ('queued', 'running', 'partial');

  return found;
end;
$function$
