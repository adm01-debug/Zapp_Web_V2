CREATE OR REPLACE FUNCTION public.claim_ai_jobs(p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 90)
 RETURNS SETOF ai_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limit integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_worker is null or p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$' then
    raise exception 'invalid_ai_job_worker' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid_ai_job_lease' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_ai_job_limit' using errcode = '22023';
  end if;

  v_limit := least(p_limit, 100);

  -- (a) Reaper de lease vencido — decisão em três (IA-202/R2-API-026):
  --     efeito externo JÁ marcado => a chamada pode ter chegado ao provedor e o
  --     aceite é incerto: reenfileirar seria retry cego com risco de 2ª cobrança.
  --     O job vai ao terminal 'outcome_unknown' (IA-046) para reconciliação.
  --     Sem marca, o comportamento é o de sempre: 'failed' se esgotou tentativas,
  --     senão 'queued' com o MESMO backoff exponencial.
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

  -- (b) Reaper de expiração: job não-terminal com expires_at vencido vira 'failed' terminal.
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

  -- (c) Claim: prioridade primeiro, depois disponibilidade e ordem de criação.
  --     Cada tentativa nasce SEM marca de efeito (effect_started_at = null): a
  --     marca de uma tentativa anterior nunca contamina a decisão da corrente.
  return query
  with candidates as (
    select job.id
      from public.ai_jobs as job
     where job.status = 'queued'
       and job.available_at <= now()
       and job.attempt_count < job.max_attempts
     order by job.priority, job.available_at, job.created_at
     for update skip locked
     limit v_limit
  )
  update public.ai_jobs as job
     set status = 'running',
         attempt_count = job.attempt_count + 1,
         started_at = coalesce(job.started_at, now()),
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         effect_started_at = null,
         locked_by = p_worker,
         locked_at = now(),
         heartbeat_at = now(),
         updated_at = now()
    from candidates
   where job.id = candidates.id
  returning job.*;
end;
$function$
