-- ia045_ia046_ai_jobs_durabilidade_e_estados
-- versão 20261002371230 reservada para hermes-ia-bloco-05-pr3-fila-outbox-estados-26100201460a2c em 2026-10-02T01:46:46-03:00 (hermes-db-migrar --nova)
-- rollback: SELECT cron.unschedule('ai-jobs-tick-1min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-jobs-tick-1min'); DELETE FROM vault.secrets WHERE name = 'ai_jobs_cron_secret'; DROP FUNCTION IF EXISTS public.get_ai_jobs_cron_secret(); DROP FUNCTION IF EXISTS public.trigger_ai_jobs_tick(); DROP FUNCTION IF EXISTS public.cancel_ai_job(uuid, text); DROP FUNCTION IF EXISTS public.reap_ai_jobs(); DROP FUNCTION IF EXISTS public.finish_ai_job(uuid, uuid, text, jsonb, text); DROP FUNCTION IF EXISTS public.heartbeat_ai_job(uuid, uuid, integer); DROP FUNCTION IF EXISTS public.claim_ai_jobs(text, integer, integer); DROP FUNCTION IF EXISTS public.enqueue_ai_job(text, text, text, uuid, jsonb, integer, timestamptz, timestamptz, integer); DROP TABLE IF EXISTS public.ai_jobs;
--
-- Bloco 05 / PR-3 — IA-045 (jobs duráveis) e IA-046 (estados padronizados).
-- Classe: contrato (CREATE OR REPLACE FUNCTION + REVOKE + ALTER TABLE … ENABLE ROW LEVEL SECURITY).
-- A mudança é ADITIVA no sentido de não remover nem alterar objeto vivo: só cria a tabela
-- public.ai_jobs, três índices parciais, sete funções novas e um job de cron. Não há DROP de
-- nome vivo nem DML sem WHERE.
--
-- Por que existe a tabela (IA-045): uma chamada de IA pode levar minutos e o isolate da edge
-- morre no meio. O job aceito precisa SOBREVIVER ao isolate — por isso o estado é DURÁVEL no
-- banco, com idempotência (idempotency_key UNIQUE), lease (lease_token/lease_expires_at),
-- heartbeat, expiração (expires_at) e claim concorrente sem corrida (FOR UPDATE SKIP LOCKED).
-- Segue o MESMO idioma de crm_sync_outbox (20260908180000 + hardening 20260908220000): claim
-- com reaper limitado, lease por token, e backoff exponencial no retorno à fila. A justificativa
-- de criar uma quinta fila (em vez de reusar as quatro de domínio) está em docs/ia/IA-007.
--
-- Vocabulário congelado (IA-046), EXATAMENTE sete valores de status:
--   não-terminais: queued, running, partial   (partial NÃO é concluído — pode continuar);
--   terminais:     succeeded, failed, cancelled, outcome_unknown.
-- Transições válidas (mesmas da interface em src/lib/aiJobs/status.ts e do worker em
-- supabase/functions/_shared/ai-jobs.ts — os três artefatos sob o mesmo contrato de teste):
--   queued  -> running | cancelled
--   running -> partial | succeeded | failed | cancelled | outcome_unknown
--   partial -> running | succeeded | failed | cancelled | outcome_unknown
--   terminal -> (nenhum destino)
--
-- Segurança: RLS habilitada SEM policy, de propósito — só service_role acessa (mesma postura de
-- crm_sync_outbox e ai_budget_reservations). Todas as RPCs são SECURITY DEFINER com
-- search_path = public, pg_temp, exigem auth.role() = 'service_role' e têm EXECUTE revogado de
-- public/anon/authenticated.
--
-- Agendador: pg_cron + pg_net já instalados. trigger_ai_jobs_tick() faz net.http_post para a edge
-- function ai-jobs-worker (a edge é construída no PR seguinte; a chamada é forward-reference, como
-- em trigger_pending_multiplix_dispatches). A URL do projeto é fixa (não é segredo — o MESMO
-- endereço aparece em 20260930430000 e 20260927320000); o x-cron-secret vem do Vault
-- (ai_jobs_cron_secret, gerado no banco e criado só se não existir, como multiplix_cron_secret).
-- A chave NÃO é inventada neste arquivo.

-- ============================================================================
-- IA-045 · tabela durável da fila de jobs de IA
-- ============================================================================

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
);

-- Claim: só 'queued' é arrancável; ordena por (priority, available_at) — o índice serve a ordem.
create index if not exists idx_ai_jobs_queued_priority
  on public.ai_jobs (priority, available_at)
  where status = 'queued';

-- Reaper de lease: varre 'running'/'partial' com lease vencido.
create index if not exists idx_ai_jobs_running_lease
  on public.ai_jobs (lease_expires_at)
  where status = 'running';

-- Reaper de expiração: só linhas com expires_at definido entram na varredura.
create index if not exists idx_ai_jobs_status_expires
  on public.ai_jobs (status, expires_at)
  where expires_at is not null;

-- RLS habilitada SEM policy: anon/authenticated não têm GRANT nem caminho de policy;
-- só service_role (via RPCs SECURITY DEFINER) toca a tabela.
alter table public.ai_jobs enable row level security;
revoke all on table public.ai_jobs from public, anon, authenticated;
grant all on table public.ai_jobs to service_role;

comment on table public.ai_jobs is
  'IA-045: fila durável de jobs de IA. status in (queued,running,partial,succeeded,failed,cancelled,outcome_unknown) — IA-046. idempotency_key UNIQUE; lease por lease_token/lease_expires_at; expiração por expires_at.';

-- ============================================================================
-- IA-045 · ciclo de vida (enqueue / claim / heartbeat / finish / reap / cancel)
-- ============================================================================

-- Enfileira de forma IDEMPOTENTE: a mesma chave devolve o MESMO id, sem criar outro job.
-- ON CONFLICT DO NOTHING + SELECT cobre a corrida de dois enqueues com a mesma chave.
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
$$;

comment on function public.enqueue_ai_job(text, text, text, uuid, jsonb, integer, timestamptz, timestamptz, integer) is
  'IA-045: enfileira um job idempotente por p_idempotency_key (repetir devolve o mesmo id).';

-- Claim concorrente: roda os dois reapers e arrenda até p_limit jobs 'queued' elegíveis.
-- FOR UPDATE SKIP LOCKED garante que dois workers não peguem a mesma linha.
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
$$;

comment on function public.claim_ai_jobs(text, integer, integer) is
  'IA-045: roda os reapers e arrenda até p_limit jobs queued (FOR UPDATE SKIP LOCKED). p_worker casa ^[A-Za-z0-9._:@/-]{1,100}$; lease entre 30 e 300s.';

-- Heartbeat: renova o lease SÓ se o token bate e o status é não-terminal. Devolve false quando
-- o lease foi perdido — isso é RESULTADO, não exceção (o worker trata como lease perdido).
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
$$;

comment on function public.heartbeat_ai_job(uuid, uuid, integer) is
  'IA-045: renova o lease se o token bate e o status é não-terminal; false = lease perdido (não lança).';

-- Finish: valida a TRANSIÇÃO congelada (IA-046) e o token. Transição inválida lança
-- 'invalid_ai_job_transition' (22023); token errado/lease perdido devolve false. Ao entrar em
-- status TERMINAL, preenche finished_at e limpa as colunas de lease.
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
$$;

comment on function public.finish_ai_job(uuid, uuid, text, jsonb, text) is
  'IA-045/IA-046: conclui/avança um job validando a transição congelada. Terminal limpa o lease; transição inválida lança 22023; lease perdido devolve false.';

-- Reaper avulso: faz os DOIS reapers e devolve quantas linhas mexeu (para o worker chamar no tick).
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
$$;

comment on function public.reap_ai_jobs() is
  'IA-045: recupera leases vencidos e jobs expirados; devolve o total de linhas mexidas.';

-- Cancelamento explícito: queued|running|partial -> cancelled; já terminal devolve false.
-- p_reason é aceito pelo contrato do chamador e NÃO é persistido (não há coluna de motivo) —
-- fica no log do chamador. O código de erro terminal é fixo 'CANCELLED'.
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
$$;

comment on function public.cancel_ai_job(uuid, text) is
  'IA-046: cancela um job não-terminal (queued/running/partial -> cancelled). Job já terminal devolve false. p_reason não é persistido.';

-- ============================================================================
-- Agendador (pg_cron + pg_net) · tick de 1 minuto para a edge ai-jobs-worker
-- ============================================================================

-- Segredo dedicado do cron, criado no banco (só se não existir) — NÃO é uma chave literal
-- inventada aqui; o valor é gerado com random(). Mesmo padrão de multiplix_cron_secret e
-- talkx_cron_secret. Tolerante à ausência do Vault em PostgreSQL descartável.
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
$$;

-- RPC para a edge function LER o segredo (SECURITY DEFINER, só service_role) — MESMO idioma
-- literal de get_multiplix_cron_secret() (20260927320000), get_talkx_cron_secret() e
-- get_connection_health_check_cron_secret(): o worker compara o header x-cron-secret com este
-- valor via timingSafeEqual. Sem esta função o worker não teria contra o que comparar.
-- Escrita DIRETA (não via DO+EXECUTE) de propósito: a projeção forward-only do guard de catálogo
-- (scripts/db-audit/supabase-usage-guard.mjs) lê o texto das migrations para legitimar o objeto;
-- dentro de uma string de EXECUTE o CREATE não seria visto e a chamada do worker viraria violação.
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
$$;

revoke all on function public.get_ai_jobs_cron_secret() from public, anon, authenticated;
grant execute on function public.get_ai_jobs_cron_secret() to service_role;

-- Tick: um net.http_post para a edge ai-jobs-worker. A URL é a do projeto (fixa, como em
-- 20260930430000 e 20260927320000); o Bearer usa a anon key e o header x-cron-secret usa o
-- segredo do Vault. pg_cron roda como o dono do job (sem JWT): o papel de serviço é declarado
-- localmente (transacional) antes da guarda, mesmo idioma de trigger_talkx_engine_tick.
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
$$;

-- ACL: as sete funções novas são só para service_role.
revoke all on function public.enqueue_ai_job(text, text, text, uuid, jsonb, integer, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.claim_ai_jobs(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_ai_job(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.finish_ai_job(uuid, uuid, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.reap_ai_jobs()
  from public, anon, authenticated;
revoke all on function public.cancel_ai_job(uuid, text)
  from public, anon, authenticated;
revoke all on function public.trigger_ai_jobs_tick()
  from public, anon, authenticated;

grant execute on function public.enqueue_ai_job(text, text, text, uuid, jsonb, integer, timestamptz, timestamptz, integer)
  to service_role;
grant execute on function public.claim_ai_jobs(text, integer, integer)
  to service_role;
grant execute on function public.heartbeat_ai_job(uuid, uuid, integer)
  to service_role;
grant execute on function public.finish_ai_job(uuid, uuid, text, jsonb, text)
  to service_role;
grant execute on function public.reap_ai_jobs()
  to service_role;
grant execute on function public.cancel_ai_job(uuid, text)
  to service_role;
grant execute on function public.trigger_ai_jobs_tick()
  to service_role;

-- Agendamento idempotente: só cria o job se pg_cron existir E o job ainda não existir
-- (o mesmo nome reexecutado no pg_cron é UPDATE — o guard evita depender disso).
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
$$;

-- Fail-closed: se qualquer RPC sumir (um CREATE OR REPLACE que não colou), aborta em vez de
-- deixar o contrato pela metade. Checagem por NOME (sem repetir assinaturas de tipo).
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
$$;
