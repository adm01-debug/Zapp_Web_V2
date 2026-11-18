create or replace function public.ai_rate_limit_hit(p_key text, p_window_start timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.edge_rate_limits as e (key, window_start, hits, updated_at)
  values (p_key, p_window_start, 1, now())
  on conflict (key) do update
    set hits = case when e.window_start = excluded.window_start then e.hits + 1 else 1 end,
        window_start = excluded.window_start,
        updated_at = now()
  returning e.hits;
$$

revoke all on function public.ai_rate_limit_hit(text, timestamp with time zone) from public, anon, authenticated

grant execute on function public.ai_rate_limit_hit(text, timestamp with time zone) to service_role

comment on function public.ai_rate_limit_hit(text, timestamp with time zone) is
  'IA-043: incrementa e devolve o contador compartilhado de rate limit (edge_rate_limits) em UM statement. p_key deve embutir a janela (ex.: ai:user:<fn>:<id>:<ISO>).'

create or replace function public.ai_rate_limit_purge(p_older_than timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.edge_rate_limits as e
     where e.updated_at < p_older_than
    returning 1
  )
  select coalesce(count(*), 0)::integer from removed;
$$

revoke all on function public.ai_rate_limit_purge(timestamp with time zone) from public, anon, authenticated

grant execute on function public.ai_rate_limit_purge(timestamp with time zone) to service_role

comment on function public.ai_rate_limit_purge(timestamp with time zone) is
  'IA-043: remove contadores de rate limit parados (updated_at < p_older_than) e devolve a contagem. p_older_than NULL não apaga nada.'

create table if not exists public.ai_budget_reservations (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text not null unique,
  user_id          uuid,
  function_name    text not null,
  reserved_tokens  integer not null,
  actual_tokens    integer,
  status           text not null default 'reserved'
                     constraint ai_budget_reservations_status_check
                     check (status in ('reserved', 'settled', 'released', 'expired')),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
)

create index if not exists idx_ai_budget_reservations_reserved_expiry
  on public.ai_budget_reservations (status, expires_at)
  where status = 'reserved'

alter table public.ai_budget_reservations enable row level security

revoke all on table public.ai_budget_reservations from public, anon, authenticated

grant all on table public.ai_budget_reservations to service_role

comment on table public.ai_budget_reservations is
  'IA-044: reservas de orçamento de IA. reserved_tokens é a INTENÇÃO (não faturamento); só actual_tokens (ai_budget_settle) é uso real. status: reserved|settled|released|expired.'

create or replace function public.ai_budget_reserve(
  p_idempotency_key text,
  p_user_id uuid,
  p_function_name text,
  p_estimated_tokens integer,
  p_limit_tokens integer,
  p_ttl_ms integer
)
returns table (id uuid, allowed boolean, used_tokens integer, limit_tokens integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_used integer;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'ai_budget_reserve: p_idempotency_key obrigatorio' using errcode = '22023';
  end if;
  if p_function_name is null or btrim(p_function_name) = '' then
    raise exception 'ai_budget_reserve: p_function_name obrigatorio' using errcode = '22023';
  end if;
  if p_estimated_tokens is null or p_estimated_tokens < 0 then
    raise exception 'ai_budget_reserve: p_estimated_tokens invalido' using errcode = '22023';
  end if;
  if p_limit_tokens is null or p_limit_tokens < 0 then
    raise exception 'ai_budget_reserve: p_limit_tokens invalido' using errcode = '22023';
  end if;
  if p_ttl_ms is null or p_ttl_ms <= 0 then
    raise exception 'ai_budget_reserve: p_ttl_ms invalido' using errcode = '22023';
  end if;

  -- Serializa TODAS as reservas do mesmo dono dentro desta transacao. Sem isto, duas chamadas
  -- paralelas do mesmo usuario somariam o MESMO estado e ambas inseririam (o furo do count()).
  perform pg_advisory_xact_lock(hashtext(coalesce(p_user_id::text, 'anon')));

  -- Idempotencia: a MESMA chave devolve a MESMA reserva (a IA segue), sem dobrar consumo.
  select r.id into v_id
    from public.ai_budget_reservations as r
   where r.idempotency_key = p_idempotency_key;

  if v_id is not null then
    select coalesce(sum(r.reserved_tokens), 0) into v_used
      from public.ai_budget_reservations as r
     where r.user_id is not distinct from p_user_id
       and r.status = 'reserved'
       and r.expires_at > now();
    return query select v_id, true, v_used, p_limit_tokens;
    return;
  end if;

  -- Soma viva do dono (sob o lock): reservas 'reserved' ainda NAO vencidas.
  select coalesce(sum(r.reserved_tokens), 0) into v_used
    from public.ai_budget_reservations as r
   where r.user_id is not distinct from p_user_id
     and r.status = 'reserved'
     and r.expires_at > now();

  if v_used + p_estimated_tokens <= p_limit_tokens then
    insert into public.ai_budget_reservations as r
      (idempotency_key, user_id, function_name, reserved_tokens, status, expires_at)
    values
      (p_idempotency_key, p_user_id, p_function_name, p_estimated_tokens, 'reserved',
       now() + make_interval(secs => p_ttl_ms::double precision / 1000.0))
    returning r.id into v_id;
    return query select v_id, true, v_used + p_estimated_tokens, p_limit_tokens;
  else
    return query select null::uuid, false, v_used, p_limit_tokens;
  end if;
end;
$$

revoke all on function public.ai_budget_reserve(text, uuid, text, integer, integer, integer) from public, anon, authenticated

grant execute on function public.ai_budget_reserve(text, uuid, text, integer, integer, integer) to service_role

comment on function public.ai_budget_reserve(text, uuid, text, integer, integer, integer) is
  'IA-044: reserva atômica por dono (advisory lock) e idempotente por p_idempotency_key. Só insere se (soma viva + p_estimated_tokens) <= p_limit_tokens; senão devolve allowed=false, id NULL.'

create or replace function public.ai_budget_settle(p_id uuid, p_actual_tokens integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_budget_reservations as r
     set actual_tokens = p_actual_tokens,
         status = 'settled',
         updated_at = now()
   where r.id = p_id
     and r.status = 'reserved';
$$

revoke all on function public.ai_budget_settle(uuid, integer) from public, anon, authenticated

grant execute on function public.ai_budget_settle(uuid, integer) to service_role

comment on function public.ai_budget_settle(uuid, integer) is
  'IA-044: grava o uso REAL (p_actual_tokens) da reserva e marca settled. Só transiciona reserved -> settled.'

create or replace function public.ai_budget_release(p_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_budget_reservations as r
     set status = 'released',
         updated_at = now()
   where r.id = p_id
     and r.status = 'reserved';
$$

revoke all on function public.ai_budget_release(uuid, text) from public, anon, authenticated

grant execute on function public.ai_budget_release(uuid, text) to service_role

comment on function public.ai_budget_release(uuid, text) is
  'IA-044: libera uma reserva não gasta (reserved -> released). p_reason não é persistido (sem coluna); use no log.'

create or replace function public.ai_budget_reconcile()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.ai_budget_reservations as r
       set status = 'expired',
           updated_at = now()
     where r.status = 'reserved'
       and r.expires_at <= now()
    returning 1
  )
  select coalesce(count(*), 0)::integer from expired;
$$

revoke all on function public.ai_budget_reconcile() from public, anon, authenticated

grant execute on function public.ai_budget_reconcile() to service_role

comment on function public.ai_budget_reconcile() is
  'IA-044: marca expired as reservas reserved vencidas e devolve a contagem (reconciliação de execução interrompida).'
