CREATE OR REPLACE FUNCTION public.cancel_ai_job(p_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'invalid_ai_job_cancel' using errcode = '22023';
  end if;

  update public.ai_jobs as job
     set status = 'cancelled',
         last_error_code = 'CANCELLED',
         finished_at = now(),
         lease_token = null, locked_at = null, locked_by = null,
         lease_expires_at = null, heartbeat_at = null,
         updated_at = now()
   where job.id = p_id
     and job.status in ('queued', 'running', 'partial');

  return found;
end;
$function$
