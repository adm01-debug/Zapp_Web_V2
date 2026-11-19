create table if not exists public.ai_jobs (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text not null unique,
  kind             text not null,
  function_name    text not null,
  user_id          uuid,
  payload          jsonb not null default '{}'::jsonb
                     constraint ai_jobs_payload_object
                     check (jsonb_typeof(payload) = 'object'),
  priority         integer not null default 100
                     constraint ai_jobs_priority_range
                     check (priority between 0 and 1000),
  status           text not null default 'queued'
                     constraint ai_jobs_status_check
                     check (status in ('queued', 'running', 'partial', 'succeeded', 'failed', 'cancelled', 'outcome_unknown')),
  attempt_count    integer not null default 0
                     constraint ai_jobs_attempt_count_nonneg
                     check (attempt_count >= 0),
  max_attempts     integer not null default 8
                     constraint ai_jobs_max_attempts_range
                     check (max_attempts between 1 and 50),
  available_at     timestamptz not null default now(),
  expires_at       timestamptz,
  locked_at        timestamptz,
  locked_by        text,
  lease_token      uuid,
  lease_expires_at timestamptz,
  heartbeat_at     timestamptz,
  result           jsonb,
  last_error_code  text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
)

create index if not exists idx_ai_jobs_queued_priority
  on public.ai_jobs (priority, available_at)
  where status = 'queued'

create index if not exists idx_ai_jobs_running_lease
  on public.ai_jobs (lease_expires_at)
  where status = 'running'

create index if not exists idx_ai_jobs_status_expires
  on public.ai_jobs (status, expires_at)
  where expires_at is not null

alter table public.ai_jobs enable row level security

revoke all on table public.ai_jobs from public, anon, authenticated

grant all on table public.ai_jobs to service_role

comment on table public.ai_jobs is
  'IA-045: fila durável de jobs de IA. status in (queued,running,partial,succeeded,failed,cancelled,outcome_unknown) — IA-046. idempotency_key UNIQUE; lease por lease_token/lease_expires_at; expiração por expires_at.'

create or replace function public.enqueue_ai_job(
  p_idempotency_key text,
  p_kind text,
  p_function_name text,
  p_user_id uuid,
  p_payload jsonb,
  p_priority integer default 100,
  p_available_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_max_attempts integer default 8
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid_ai_job_idempotency_key' using errcode = '22023';
  end if;
  if p_kind is null or btrim(p_kind) = '' then
    raise exception 'invalid_ai_job_kind' using errcode = '22023';
  end if;
  if p_function_name is null or btrim(p_function_name) = '' then
    raise exception 'invalid_ai_job_function_name' using errcode = '22023';
  end if;
  if p_priority is null or p_priority not between 0 and 1000 then
    raise exception 'invalid_ai_job_priority' using errcode = '22023';
  end if;
  if p_max_attempts is null or p_max_attempts not between 1 and 50 then
    raise exception 'invalid_ai_job_max_attempts' using errcode = '22023';
  end if;

  insert into public.ai_jobs
    (idempotency_key, kind, function_name, user_id, payload,
     priority, available_at, expires_at, max_attempts, status)
  values
    (p_idempotency_key, p_kind, p_function_name, p_user_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_priority, 100), coalesce(p_available_at, now()), p_expires_at,
     coalesce(p_max_attempts, 8), 'queued')
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select job.id into v_id
      from public.ai_jobs as job
     where job.idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$

comment on function public.enqueue_ai_job(text, text, text, uuid, jsonb, integer, timestamptz, timestamptz, integer) is
  'IA-045: enfileira um job idempotente por p_idempotency_key (repetir devolve o mesmo id).'

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

  -- (a) Reaper de lease vencido: se ainda cabe tentativa volta para 'queued' com backoff
  --     exponencial (mesmo cálculo de fail_crm_sync_outbox); se esgotou, 'failed' terminal.
  update public.ai_jobs as job
     set status = case when job.attempt_count >= job.max_attempts then 'failed' else 'queued' end,
         available_at = case when job.attempt_count >= job.max_attempts
                             then job.available_at
                             else now() + make_interval(secs => least(3600, (power(2, least(job.attempt_count, 10)) * 30)::integer))
                        end,
         last_error_code = case when job.attempt_count >= job.max_attempts
                                then 'LEASE_EXPIRED_MAX_ATTEMPTS'
                                else job.last_error_code
                           end,
         finished_at = case when job.attempt_count >= job.max_attempts then now() else job.finished_at end,
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
         locked_by = p_worker,
         locked_at = now(),
         heartbeat_at = now(),
         updated_at = now()
    from candidates
   where job.id = candidates.id
  returning job.*;
end;
$$

comment on function public.claim_ai_jobs(text, integer, integer) is
  'IA-045: roda os reapers e arrenda até p_limit jobs queued (FOR UPDATE SKIP LOCKED). p_worker casa ^[A-Za-z0-9._:@/-]{1,100}$; lease entre 30 e 300s.'

create or replace function public.heartbeat_ai_job(
  p_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 90
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
$$

comment on function public.heartbeat_ai_job(uuid, uuid, integer) is
  'IA-045: renova o lease se o token bate e o status é não-terminal; false = lease perdido (não lança).'

create or replace function public.finish_ai_job(
  p_id uuid,
  p_lease_token uuid,
  p_status text,
  p_result jsonb default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$

comment on function public.finish_ai_job(uuid, uuid, text, jsonb, text) is
  'IA-045/IA-046: conclui/avança um job validando a transição congelada. Terminal limpa o lease; transição inválida lança 22023; lease perdido devolve false.'

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

  update public.ai_jobs as job
     set status = case when job.attempt_count >= job.max_attempts then 'failed' else 'queued' end,
         available_at = case when job.attempt_count >= job.max_attempts
                             then job.available_at
                             else now() + make_interval(secs => least(3600, (power(2, least(job.attempt_count, 10)) * 30)::integer))
                        end,
         last_error_code = case when job.attempt_count >= job.max_attempts
                                then 'LEASE_EXPIRED_MAX_ATTEMPTS'
                                else job.last_error_code
                           end,
         finished_at = case when job.attempt_count >= job.max_attempts then now() else job.finished_at end,
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
$$

comment on function public.reap_ai_jobs() is
  'IA-045: recupera leases vencidos e jobs expirados; devolve o total de linhas mexidas.'

create or replace function public.cancel_ai_job(p_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$

comment on function public.cancel_ai_job(uuid, text) is
  'IA-046: cancela um job não-terminal (queued/running/partial -> cancelled). Job já terminal devolve false. p_reason não é persistido.'

do $$
begin
  if to_regclass('vault.secrets') is not null then
    if not exists (select 1 from vault.secrets where name = 'ai_jobs_cron_secret') then
      perform vault.create_secret(md5(random()::text) || md5(random()::text), 'ai_jobs_cron_secret');
    end if;
  end if;
exception when others then
  raise warning 'ai_jobs_cron_secret_seed_skipped: %', sqlerrm;
end;
$$

create or replace function public.get_ai_jobs_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'ai_jobs_cron_secret'
  limit 1
$$

revoke all on function public.get_ai_jobs_cron_secret() from public, anon, authenticated

grant execute on function public.get_ai_jobs_cron_secret() to service_role

create or replace function public.trigger_ai_jobs_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_anon_key    text;
  v_cron_secret text;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select decrypted_secret into v_anon_key
    from vault.decrypted_secrets where name = 'zapp_anon_key' limit 1;
  select decrypted_secret into v_cron_secret
    from vault.decrypted_secrets where name = 'ai_jobs_cron_secret' limit 1;

  if v_anon_key is null or v_cron_secret is null then
    return;  -- sem credencial configurada não há como invocar a edge
  end if;

  perform net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/ai-jobs-worker',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-cron-secret', v_cron_secret
    ),
    timeout_milliseconds := 30000
  );
end;
$$

revoke all on function public.enqueue_ai_job(text, text, text, uuid, jsonb, integer, timestamptz, timestamptz, integer)
  from public, anon, authenticated

revoke all on function public.claim_ai_jobs(text, integer, integer)
  from public, anon, authenticated

revoke all on function public.heartbeat_ai_job(uuid, uuid, integer)
  from public, anon, authenticated

revoke all on function public.finish_ai_job(uuid, uuid, text, jsonb, text)
  from public, anon, authenticated

revoke all on function public.reap_ai_jobs()
  from public, anon, authenticated

revoke all on function public.cancel_ai_job(uuid, text)
  from public, anon, authenticated

revoke all on function public.trigger_ai_jobs_tick()
  from public, anon, authenticated

grant execute on function public.enqueue_ai_job(text, text, text, uuid, jsonb, integer, timestamptz, timestamptz, integer)
  to service_role

grant execute on function public.claim_ai_jobs(text, integer, integer)
  to service_role

grant execute on function public.heartbeat_ai_job(uuid, uuid, integer)
  to service_role

grant execute on function public.finish_ai_job(uuid, uuid, text, jsonb, text)
  to service_role

grant execute on function public.reap_ai_jobs()
  to service_role

grant execute on function public.cancel_ai_job(uuid, text)
  to service_role

grant execute on function public.trigger_ai_jobs_tick()
  to service_role

do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'ai-jobs-tick-1min') then
      perform cron.schedule('ai-jobs-tick-1min', '* * * * *', 'select public.trigger_ai_jobs_tick()');
    end if;
  end if;
exception when others then
  raise warning 'ai_jobs_tick_cron_schedule_skipped: %', sqlerrm;
end;
$$

do $$
declare
  v_missing text;
begin
  select string_agg(esperado.nome, ', ') into v_missing
    from (values ('enqueue_ai_job'), ('claim_ai_jobs'), ('heartbeat_ai_job'),
                 ('finish_ai_job'), ('reap_ai_jobs'), ('cancel_ai_job'),
                 ('trigger_ai_jobs_tick')) as esperado(nome)
   where not exists (
     select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = esperado.nome
   );

  if v_missing is not null then
    raise exception 'ai_jobs_rpcs_ausentes: %', v_missing;
  end if;
end;
$$
