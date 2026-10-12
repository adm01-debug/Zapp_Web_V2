-- email_frt_sla
-- Rollback: dropa o gatilho e as 4 funções novas, e remove as 3 colunas de SLA de email_threads.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists email_messages_register_first_reply on public.email_messages;
--   drop function if exists public.trg_email_thread_first_reply();
--   drop function if exists public.register_email_first_reply_internal(uuid, timestamptz);
--   drop function if exists public.email_sla_summary();
--   drop function if exists public.email_business_minutes(timestamptz, timestamptz);
--   drop function if exists public.email_sla_threshold_minutes();
--   alter table public.email_threads drop constraint if exists email_threads_sla_status_check;
--   alter table public.email_threads drop column if exists first_reply_at, drop column if exists frt_minutes, drop column if exists sla_status;
--
-- MAIL-SLA-01: o SLA de primeira resposta por e-mail é calculado no banco, ao
-- primeiro envio do atendente depois de uma mensagem recebida. Antes não existia
-- nenhuma marca de primeira resposta em email_threads nem contagem de violados/em risco.
--
-- Fontes de configuração (as que o V2 já tem — nenhuma regra nova):
--   * limite de primeira resposta: public.sla_configurations.first_response_minutes
--     (mesma tabela que o SLA do WhatsApp usa; padrão da linha é_default/is_active,
--     com 480 min de fallback = 8h);
--   * horário de atendimento: public.business_hours da conexão WhatsApp marcada como
--     public.whatsapp_connections.is_default (mesma fonte de public.is_within_business_hours,
--     conferida em Settings > Horários). Sem configuração, o V2 assume aberto (24/7),
--     o mesmo comportamento de is_within_business_hours — não inventamos janela nova.
--   * fuso do cálculo: America/Sao_Paulo (fuso do negócio; o Brasil não tem mais DST).
--
-- Escopo desta migration: 3 colunas em email_threads (aditivas), 1 gatilho em
-- email_messages (AFTER INSERT, só direction='outbound') e 4 funções. Nada de DROP,
-- nada de GRANT/papel mudado, nenhum dado existente reescrito (as colunas nascem NULL
-- e o gatilho só escreve em linha de thread do próprio evento).

-- ---------------------------------------------------------------------------
-- 1) Colunas aditivas em public.email_threads
-- ---------------------------------------------------------------------------
alter table public.email_threads
  add column if not exists first_reply_at timestamptz,
  add column if not exists frt_minutes integer,
  add column if not exists sla_status text;

alter table public.email_threads
  add constraint email_threads_sla_status_check
  check (sla_status is null or sla_status in ('ok', 'risco', 'violado'));

-- ---------------------------------------------------------------------------
-- 2) Limite de primeira resposta: a config de SLA que o V2 já tem
-- ---------------------------------------------------------------------------
create or replace function public.email_sla_threshold_minutes()
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_minutes integer;
begin
  select cfg.first_response_minutes
    into v_minutes
    from public.sla_configurations cfg
   where coalesce(cfg.is_active, true)
   order by coalesce(cfg.is_default, false) desc, cfg.created_at desc
   limit 1;

  return coalesce(v_minutes, 480);
end $$;

-- ---------------------------------------------------------------------------
-- 3) Minutos dentro do horário comercial, pela config de horários do V2
--    (business_hours da conexão padrão; sem config = aberto, como is_within_business_hours)
-- ---------------------------------------------------------------------------
create or replace function public.email_business_minutes(p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tz        constant text := 'America/Sao_Paulo';
  v_from      timestamp;
  v_to        timestamp;
  v_day       date;
  v_dow       integer;
  v_conn      uuid;
  v_is_open   boolean;
  v_open      time;
  v_close     time;
  v_lo        timestamp;
  v_hi        timestamp;
  v_total     integer := 0;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    return 0;
  end if;

  v_from := p_from at time zone v_tz;
  v_to   := p_to   at time zone v_tz;

  select c.id into v_conn
    from public.whatsapp_connections c
   where c.is_default = true
   limit 1;

  v_day := v_from::date;
  while v_day <= v_to::date loop
    v_dow := extract(dow from v_day)::integer;

    if v_conn is null then
      -- Sem config de horário no V2: assume aberto (mesma leitura de is_within_business_hours).
      v_is_open := true;
      v_open    := '00:00:00';
      v_close   := '23:59:59';
    else
      select bh.is_open, bh.open_time, bh.close_time
        into v_is_open, v_open, v_close
        from public.business_hours bh
       where bh.whatsapp_connection_id = v_conn
         and bh.day_of_week = v_dow;

      if not found then
        v_is_open := true;
        v_open    := '00:00:00';
        v_close   := '23:59:59';
      end if;
    end if;

    if coalesce(v_is_open, false)
       and v_open is not null and v_close is not null
       and v_close > v_open then          -- intervalo que cruza a meia-noite não conta (config padrão é diurna)
      v_lo := greatest(v_from, v_day + v_open);
      v_hi := least(v_to, v_day + v_close);
      if v_hi > v_lo then
        v_total := v_total + floor(extract(epoch from (v_hi - v_lo)) / 60)::integer;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return v_total;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Marca a primeira resposta da thread (idempotente, atômica)
-- ---------------------------------------------------------------------------
create or replace function public.register_email_first_reply_internal(
  p_thread_id uuid,
  p_responded_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_anchor    timestamptz;
  v_threshold integer;
  v_frt       integer;
  v_status    text;
begin
  if p_thread_id is null or p_responded_at is null then
    return;
  end if;

  -- trava por thread: dois envios simultâneos não gravam a primeira resposta duas vezes
  perform pg_advisory_xact_lock(hashtextextended(p_thread_id::text, 0));

  if exists (
    select 1 from public.email_threads t
     where t.id = p_thread_id
       and t.first_reply_at is not null
  ) then
    return;
  end if;

  -- âncora: primeira mensagem recebida ainda sem resposta — a primeira inbound
  -- depois do último envio anterior a esta resposta.
  select min(m.internal_date) into v_anchor
    from public.email_messages m
   where m.thread_id = p_thread_id
     and m.direction = 'inbound'
     and m.internal_date <= p_responded_at
     and m.internal_date > coalesce(
           (select max(o.internal_date)
              from public.email_messages o
             where o.thread_id = p_thread_id
               and o.direction = 'outbound'
               and o.internal_date < p_responded_at),
           '-infinity'::timestamptz);

  if v_anchor is null then
    return;                             -- não havia mensagem recebida em aberto: nada a marcar
  end if;

  v_threshold := public.email_sla_threshold_minutes();
  v_frt       := public.email_business_minutes(v_anchor, p_responded_at);

  if v_frt > v_threshold then
    v_status := 'violado';
  elsif v_frt > (v_threshold * 4 / 5) then
    v_status := 'risco';                -- acima de 80% do limite
  else
    v_status := 'ok';
  end if;

  update public.email_threads
     set first_reply_at = p_responded_at,
         frt_minutes    = v_frt,
         sla_status     = v_status
   where id = p_thread_id
     and first_reply_at is null;        -- segunda linha de defesa contra corrida
end $$;

-- ---------------------------------------------------------------------------
-- 5) Gatilho: dispara no INSERT de mensagem enviada (direction='outbound')
-- ---------------------------------------------------------------------------
create or replace function public.trg_email_thread_first_reply()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.direction = 'outbound' then
    perform public.register_email_first_reply_internal(new.thread_id, new.internal_date);
  end if;
  return new;
end $$;

drop trigger if exists email_messages_register_first_reply on public.email_messages;
create trigger email_messages_register_first_reply
  after insert on public.email_messages
  for each row
  execute function public.trg_email_thread_first_reply();

-- ---------------------------------------------------------------------------
-- 6) Resumo para o gestor: quantas threads em risco e violadas
--    SECURITY INVOKER de propósito: a RLS de email_threads limita o resultado
--    às contas do próprio chamador (sem SECURITY DEFINER e sem checagem de papel
--    nova — quem não enxerga a thread não conta a thread).
-- ---------------------------------------------------------------------------
create or replace function public.email_sla_summary()
returns table (total_threads integer, em_risco integer, violados integer)
language sql
stable
set search_path = pg_catalog, public
as $$
  with base as (
    select
      case
        when t.first_reply_at is not null then t.sla_status
        when b.anchor is null then 'ok'
        when public.email_business_minutes(b.anchor, now()) > public.email_sla_threshold_minutes() then 'violado'
        when public.email_business_minutes(b.anchor, now()) > (public.email_sla_threshold_minutes() * 4 / 5) then 'risco'
        else 'ok'
      end as status
      from public.email_threads t
      left join lateral (
        select min(m.internal_date) as anchor
          from public.email_messages m
         where m.thread_id = t.id
           and m.direction = 'inbound'
           and m.internal_date > coalesce(
                 (select max(o.internal_date)
                    from public.email_messages o
                   where o.thread_id = t.id
                     and o.direction = 'outbound'),
                 '-infinity'::timestamptz)
      ) b on true
  )
  select
    count(*)::integer,
    (count(*) filter (where status = 'risco'))::integer,
    (count(*) filter (where status = 'violado'))::integer
  from base;
$$;

-- ---------------------------------------------------------------------------
-- 7) Permissões: só o resumo é chamável; o resto é interno
-- ---------------------------------------------------------------------------
revoke all on function public.email_sla_threshold_minutes() from public, anon;
grant execute on function public.email_sla_threshold_minutes() to authenticated;
-- email_business_minutes e email_sla_threshold_minutes são cálculo/config puros (não
-- leem dado de cliente): ficam liberados a authenticated porque o resumo é SECURITY
-- INVOKER (para a RLS de email_threads valer) e precisa poder chamá-los.
revoke all on function public.email_business_minutes(timestamptz, timestamptz) from public, anon;
grant execute on function public.email_business_minutes(timestamptz, timestamptz) to authenticated;
revoke all on function public.register_email_first_reply_internal(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.trg_email_thread_first_reply() from public, anon, authenticated;

revoke all on function public.email_sla_summary() from public, anon;
grant execute on function public.email_sla_summary() to authenticated;
