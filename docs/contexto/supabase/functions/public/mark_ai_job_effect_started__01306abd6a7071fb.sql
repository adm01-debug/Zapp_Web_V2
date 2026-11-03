CREATE OR REPLACE FUNCTION public.mark_ai_job_effect_started(p_id uuid, p_lease_token uuid)
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
    raise exception 'invalid_ai_job_effect_mark' using errcode = '22023';
  end if;

  -- Compare-and-swap: só marca se o MESMO token ainda detém o lease em 'running'.
  -- coalesce preserva a primeira marca: a 2ª chamada com o mesmo token devolve
  -- true sem reescrever o instante (idempotente de verdade).
  update public.ai_jobs as job
     set effect_started_at = coalesce(job.effect_started_at, now()),
         updated_at = now()
   where job.id = p_id
     and job.lease_token = p_lease_token
     and job.status = 'running';

  return found;
end;
$function$
