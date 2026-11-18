CREATE OR REPLACE FUNCTION public.reap_ai_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lease   integer := 0;
  v_expired integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  -- Mesma decisão em três do reaper embutido no claim (IA-202/R2-API-026):
  -- efeito marcado => 'outcome_unknown' terminal, NUNCA volta para a fila.
  update public.ai_jobs as job
     set status = case
                    when job.effect_started_at is not null then 'outcome_unknown'
                    when job.attempt_count >= job.max_attempts then 'failed'
                    else 'queued'
                  end,
         available_at = case
                          when job.effect_started_at is not null then job.available_at
                          when job.attempt_count >= job.max_attempts then job.available_at
                          else now() + make_interval(secs => least(3600, (power(2, least(job.attempt_count, 10)) * 30)::integer))
                        end,
         last_error_code = case
                             when job.effect_started_at is not null then 'EFFECT_OUTCOME_UNKNOWN'
                             when job.attempt_count >= job.max_attempts then 'LEASE_EXPIRED_MAX_ATTEMPTS'
                             else job.last_error_code
                           end,
         finished_at = case
                         when job.effect_started_at is not null then now()
                         when job.attempt_count >= job.max_attempts then now()
                         else job.finished_at
                       end,
         lease_token = null, locked_at = null, locked_by = null,
         lease_expires_at = null, heartbeat_at = null,
         updated_at = now()
   where job.status in ('running', 'partial')
     and job.lease_expires_at is not null
     and job.lease_expires_at < now();
  get diagnostics v_lease = row_count;

  update public.ai_jobs as job
     set status = 'failed',
         last_error_code = 'EXPIRED',
         finished_at = now(),
         lease_token = null, locked_at = null, locked_by = null,
         lease_expires_at = null, heartbeat_at = null,
         updated_at = now()
   where job.status in ('queued', 'running', 'partial')
     and job.expires_at is not null
     and job.expires_at < now();
  get diagnostics v_expired = row_count;

  return v_lease + v_expired;
end;
$function$
