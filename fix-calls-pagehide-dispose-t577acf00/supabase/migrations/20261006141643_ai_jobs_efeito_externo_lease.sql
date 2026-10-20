-- ai_jobs_efeito_externo_lease
-- Rollback: recria claim_ai_jobs e reap_ai_jobs com os corpos anteriores (abaixo), dropa a RPC nova e a coluna.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.claim_ai_jobs(p_worker text, p_limit integer default 10, p_lease_seconds integer default 90) returns setof public.ai_jobs language plpgsql security definer set search_path = public, pg_temp as $$ declare v_limit integer; begin if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if; if p_worker is null or p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$' then raise exception 'invalid_ai_job_worker' using errcode = '22023'; end if; if p_lease_seconds is null or p_lease_seconds not between 30 and 300 then raise exception 'invalid_ai_job_lease' using errcode = '22023'; end if; if p_limit is null or p_limit < 1 then raise exception 'invalid_ai_job_limit' using errcode = '22023'; end if; v_limit := least(p_limit, 100); update public.ai_jobs as job set status = case when job.attempt_count >= job.max_attempts then 'failed' else 'queued' end, available_at = case when job.attempt_count >= job.max_attempts then job.available_at else now() + make_interval(secs => least(3600, (power(2, least(job.attempt_count, 10)) * 30)::integer)) end, last_error_code = case when job.attempt_count >= job.max_attempts then 'LEASE_EXPIRED_MAX_ATTEMPTS' else job.last_error_code end, finished_at = case when job.attempt_count >= job.max_attempts then now() else job.finished_at end, lease_token = null, locked_at = null, locked_by = null, lease_expires_at = null, heartbeat_at = null, updated_at = now() where job.status in ('running', 'partial') and job.lease_expires_at is not null and job.lease_expires_at < now(); update public.ai_jobs as job set status = 'failed', last_error_code = 'EXPIRED', finished_at = now(), lease_token = null, locked_at = null, locked_by = null, lease_expires_at = null, heartbeat_at = null, updated_at = now() where job.status in ('queued', 'running', 'partial') and job.expires_at is not null and job.expires_at < now(); return query with candidates as (select job.id from public.ai_jobs as job where job.status = 'queued' and job.available_at <= now() and job.attempt_count < job.max_attempts order by job.priority, job.available_at, job.created_at for update skip locked limit v_limit) update public.ai_jobs as job set status = 'running', attempt_count = job.attempt_count + 1, started_at = coalesce(job.started_at, now()), lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => p_lease_seconds), locked_by = p_worker, locked_at = now(), heartbeat_at = now(), updated_at = now() from candidates where job.id = candidates.id returning job.*; end; $$;
--   create or replace function public.reap_ai_jobs() returns integer language plpgsql security definer set search_path = public, pg_temp as $$ declare v_lease integer := 0; v_expired integer := 0; begin if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if; update public.ai_jobs as job set status = case when job.attempt_count >= job.max_attempts then 'failed' else 'queued' end, available_at = case when job.attempt_count >= job.max_attempts then job.available_at else now() + make_interval(secs => least(3600, (power(2, least(job.attempt_count, 10)) * 30)::integer)) end, last_error_code = case when job.attempt_count >= job.max_attempts then 'LEASE_EXPIRED_MAX_ATTEMPTS' else job.last_error_code end, finished_at = case when job.attempt_count >= job.max_attempts then now() else job.finished_at end, lease_token = null, locked_at = null, locked_by = null, lease_expires_at = null, heartbeat_at = null, updated_at = now() where job.status in ('running', 'partial') and job.lease_expires_at is not null and job.lease_expires_at < now(); get diagnostics v_lease = row_count; update public.ai_jobs as job set status = 'failed', last_error_code = 'EXPIRED', finished_at = now(), lease_token = null, locked_at = null, locked_by = null, lease_expires_at = null, heartbeat_at = null, updated_at = now() where job.status in ('queued', 'running', 'partial') and job.expires_at is not null and job.expires_at < now(); get diagnostics v_expired = row_count; return v_lease + v_expired; end; $$;
--   drop function if exists public.mark_ai_job_effect_started(uuid, uuid);
--   alter table public.ai_jobs drop column if exists effect_started_at;
--
-- IA-202 / R2-API-026 (P2): o reaper de lease recolocava em 'queued' job 'running'/'partial'
-- com lease vencido SEM distinguir efeito externo já iniciado — a 2ª tentativa podia chamar
-- (e cobrar) o provedor de novo. A correção é em três partes, SÓ no ramo de lease vencido:
--
--   1. Coluna durável public.ai_jobs.effect_started_at: marca do início do efeito externo
--      da tentativa corrente. Limpa a cada claim (cada tentativa nasce sem marca).
--   2. RPC mark_ai_job_effect_started(id, lease_token): o worker a chama ANTES de disparar
--      o efeito (compare-and-swap por status+token — idempotente no mesmo token).
--   3. Reapers (dentro de claim_ai_jobs e em reap_ai_jobs): lease vencido COM marca vira o
--      terminal 'outcome_unknown' + 'EFFECT_OUTCOME_UNKNOWN' (efeito incerto se resolve por
--      reconciliação, IA-047 — NUNCA por reenvio cego). SEM marca, nada muda: 'failed' se
--      esgotou tentativas, senão 'queued' com o MESMO backoff exponencial.
--
-- Nada mais muda: o reaper de expires_at continua 'failed'/'EXPIRED', as validações e o
-- claim (FOR UPDATE SKIP LOCKED) são os mesmos. Sem DROP, sem DML sem WHERE.

-- ============================================================================
-- 1. Marca durável do efeito externo
-- ============================================================================

alter table public.ai_jobs
  add column if not exists effect_started_at timestamptz;

comment on column public.ai_jobs.effect_started_at is
  'IA-202/R2-API-026: instante em que a tentativa corrente marcou o início do efeito externo (mark_ai_job_effect_started). Limpo a cada claim; preservado em outcome_unknown para reconciliação.';

-- ============================================================================
-- 2. RPC de marca: fencing por (id, lease_token) em 'running' — idempotente.
--    false = lease perdido / job fora de alcance (RESULTADO, não exceção), na
--    mesma postura de heartbeat_ai_job/finish_ai_job.
-- ============================================================================

create or replace function public.mark_ai_job_effect_started(
  p_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function public.mark_ai_job_effect_started(uuid, uuid) is
  'IA-202/R2-API-026: marca o início do efeito externo da tentativa (status=running + token). false = lease perdido/fora de alcance; idempotente no mesmo token.';

revoke all on function public.mark_ai_job_effect_started(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_ai_job_effect_started(uuid, uuid)
  to service_role;

-- ============================================================================
-- 3. Reapers em três vias. Corpos idênticos aos anteriores, EXCETO o ramo de
--    lease vencido (decisão em três) e, no claim, effect_started_at = null.
-- ============================================================================

create or replace function public.claim_ai_jobs(
  p_worker text,
  p_limit integer default 10,
  p_lease_seconds integer default 90
)
returns setof public.ai_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function public.claim_ai_jobs(text, integer, integer) is
  'IA-045: roda os reapers e arrenda até p_limit jobs queued (FOR UPDATE SKIP LOCKED). p_worker casa ^[A-Za-z0-9._:@/-]{1,100}$; lease entre 30 e 300s. IA-202: lease vencido com efeito marcado vai a outcome_unknown (nunca reenfileira); claim zera effect_started_at.';

create or replace function public.reap_ai_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function public.reap_ai_jobs() is
  'IA-045: recupera leases vencidos e jobs expirados; devolve o total de linhas mexidas. IA-202: lease vencido com efeito marcado vai a outcome_unknown (nunca reenfileira).';
