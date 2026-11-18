CREATE OR REPLACE FUNCTION public.finish_ai_job(p_id uuid, p_lease_token uuid, p_status text, p_result jsonb DEFAULT NULL::jsonb, p_error_code text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current     text;
  v_is_terminal boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_id is null or p_lease_token is null then
    raise exception 'invalid_ai_job_finish' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('queued', 'running', 'partial', 'succeeded', 'failed', 'cancelled', 'outcome_unknown') then
    raise exception 'invalid_ai_job_status' using errcode = '22023';
  end if;

  -- Estado atual sob lock, amarrado ao token: token errado/lease perdido não encontra linha.
  select job.status into v_current
    from public.ai_jobs as job
   where job.id = p_id
     and job.lease_token = p_lease_token
   for update;

  if not found then
    return false;
  end if;

  -- Mapa de transições CONGELADO (IA-046). Qualquer aresta fora dele é recusada.
  if not (
       (v_current = 'queued'  and p_status in ('running', 'cancelled'))
    or (v_current = 'running' and p_status in ('partial', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'))
    or (v_current = 'partial' and p_status in ('running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'))
  ) then
    raise exception 'invalid_ai_job_transition' using errcode = '22023';
  end if;

  v_is_terminal := p_status in ('succeeded', 'failed', 'cancelled', 'outcome_unknown');

  update public.ai_jobs as job
     set status = p_status,
         result = coalesce(p_result, job.result),
         last_error_code = coalesce(p_error_code, job.last_error_code),
         finished_at = case when v_is_terminal then now() else job.finished_at end,
         lease_token = case when v_is_terminal then null else job.lease_token end,
         locked_at = case when v_is_terminal then null else job.locked_at end,
         locked_by = case when v_is_terminal then null else job.locked_by end,
         lease_expires_at = case when v_is_terminal then null else job.lease_expires_at end,
         heartbeat_at = case when v_is_terminal then null else job.heartbeat_at end,
         updated_at = now()
   where job.id = p_id;

  return true;
end;
$function$
