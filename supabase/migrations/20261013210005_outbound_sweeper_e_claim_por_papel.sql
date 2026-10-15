-- outbound_sweeper_e_claim_por_papel
-- Rollback: remove o varredor (funcao + cron job), a RPC fail_outbound_unclaimed, a coluna delivery_failure_reason (com a CHECK) e a tabela outbound_delivery_events; recria claim_outbound_message e guard_message_delivery_internal_fields com os corpos DE 20261013210004_outbound_post_started.sql (PD-79, completos no bloco abaixo) e reemite os REVOKE/GRANT de antes. As linhas que o varredor JA marcou como 'failed' nao voltam para 'sending' (nao ha reenvio) — estado de dado irreversivel por desenho.
-- Rollback (SQL executavel, na ordem):
--   select cron.unschedule(jobid) from cron.job where jobname = 'sweep-stale-outbound-sending';
--   drop function if exists public.sweep_stale_outbound_sending(integer, integer);
--   drop function if exists public.fail_outbound_unclaimed(uuid, uuid);
--   drop table if exists public.outbound_delivery_events;
--   alter table public.messages drop constraint if exists messages_delivery_failure_reason_check;
--   alter table public.messages drop column if exists delivery_failure_reason;
--   create or replace function public.claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer default 90) returns table(message_id uuid, client_message_id uuid, contact_id uuid, agent_id uuid, content text, message_type text, media_url text, caption text, media_filename text, media_mimetype text, reply_to_id uuid, reply_external_id text, whatsapp_connection_id uuid, whatsapp_instance_name text, contact_phone text, claim_token uuid, claim_expires_at timestamptz, delivery_attempt_count integer) language plpgsql security definer set search_path = public, pg_temp as $rb$ BEGIN IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501'; END IF; IF p_message_id IS NULL OR p_agent_id IS NULL OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$' OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RAISE EXCEPTION 'invalid_delivery_claim' USING ERRCODE = '22023'; END IF; RETURN QUERY WITH candidate AS ( SELECT message.id, connection.id AS resolved_connection_id FROM public.messages AS message JOIN public.contacts AS contact ON contact.id = message.contact_id JOIN public.whatsapp_connections AS connection ON connection.id = COALESCE( message.whatsapp_connection_id, contact.whatsapp_connection_id ) AND connection.status = 'connected' AND NULLIF(connection.instance_id, '') IS NOT NULL WHERE message.id = p_message_id AND message.agent_id = p_agent_id AND message.sender = 'agent' AND message.status = 'sending' AND message.external_id IS NULL AND message.client_message_id IS NOT NULL AND regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$' AND (message.delivery_claim_token IS NULL OR message.delivery_claim_expires_at <= statement_timestamp()) AND NOT ( message.delivery_post_started_at IS NOT NULL AND message.delivery_claim_expires_at IS NOT NULL AND message.delivery_claim_expires_at <= statement_timestamp() ) FOR UPDATE OF message SKIP LOCKED ), claimed AS ( UPDATE public.messages AS message SET delivery_claim_token = gen_random_uuid(), delivery_claimed_at = statement_timestamp(), delivery_claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds), delivery_claimed_by = p_worker, delivery_attempt_count = message.delivery_attempt_count + 1, whatsapp_connection_id = candidate.resolved_connection_id, updated_at = statement_timestamp() FROM candidate WHERE message.id = candidate.id RETURNING message.* ) SELECT claimed.id, claimed.client_message_id, claimed.contact_id, claimed.agent_id, claimed.content, claimed.message_type, claimed.media_url, claimed.caption, claimed.media_filename, claimed.media_mimetype, claimed.reply_to_id, reply.external_id, claimed.whatsapp_connection_id, connection.instance_id, regexp_replace(contact.phone, '\D', '', 'g'), claimed.delivery_claim_token, claimed.delivery_claim_expires_at, claimed.delivery_attempt_count FROM claimed JOIN public.contacts AS contact ON contact.id = claimed.contact_id JOIN public.whatsapp_connections AS connection ON connection.id = claimed.whatsapp_connection_id LEFT JOIN public.messages AS reply ON reply.id = claimed.reply_to_id; end; $rb$;
--   revoke all on function public.claim_outbound_message(uuid, uuid, text, integer) from public, anon, authenticated;
--   grant execute on function public.claim_outbound_message(uuid, uuid, text, integer) to service_role;
--   create or replace function public.guard_message_delivery_internal_fields() returns trigger language plpgsql set search_path = public, pg_temp as $rb$ BEGIN IF current_user IN ('postgres', 'service_role') THEN RETURN NEW; END IF; IF (TG_OP = 'INSERT' AND ( NEW.client_message_id IS NOT NULL OR NEW.delivery_claim_token IS NOT NULL OR NEW.delivery_claimed_at IS NOT NULL OR NEW.delivery_claim_expires_at IS NOT NULL OR NEW.delivery_claimed_by IS NOT NULL OR NEW.delivery_last_claim_token IS NOT NULL OR NEW.delivery_attempt_count <> 0 OR NEW.delivery_post_started_at IS NOT NULL )) OR (TG_OP = 'UPDATE' AND ( NEW.client_message_id IS DISTINCT FROM OLD.client_message_id OR NEW.delivery_claim_token IS DISTINCT FROM OLD.delivery_claim_token OR NEW.delivery_claimed_at IS DISTINCT FROM OLD.delivery_claimed_at OR NEW.delivery_claim_expires_at IS DISTINCT FROM OLD.delivery_claim_expires_at OR NEW.delivery_claimed_by IS DISTINCT FROM OLD.delivery_claimed_by OR NEW.delivery_last_claim_token IS DISTINCT FROM OLD.delivery_last_claim_token OR NEW.delivery_attempt_count IS DISTINCT FROM OLD.delivery_attempt_count OR NEW.delivery_post_started_at IS DISTINCT FROM OLD.delivery_post_started_at )) THEN RAISE EXCEPTION 'message_delivery_internal_fields_forbidden' USING ERRCODE = '42501'; END IF; IF TG_OP = 'UPDATE' AND OLD.client_message_id IS NOT NULL AND OLD.status = 'sending' AND OLD.external_id IS NULL AND ( NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.agent_id IS DISTINCT FROM OLD.agent_id OR NEW.sender IS DISTINCT FROM OLD.sender OR NEW.content IS DISTINCT FROM OLD.content OR NEW.message_type IS DISTINCT FROM OLD.message_type OR NEW.media_url IS DISTINCT FROM OLD.media_url OR NEW.caption IS DISTINCT FROM OLD.caption OR NEW.media_filename IS DISTINCT FROM OLD.media_filename OR NEW.media_mimetype IS DISTINCT FROM OLD.media_mimetype OR NEW.media_type IS DISTINCT FROM OLD.media_type OR NEW.media_size IS DISTINCT FROM OLD.media_size OR NEW.media_meta IS DISTINCT FROM OLD.media_meta OR NEW.ptt IS DISTINCT FROM OLD.ptt OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id OR NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id OR NEW.status IS DISTINCT FROM OLD.status OR NEW.status_updated_at IS DISTINCT FROM OLD.status_updated_at OR NEW.external_id IS DISTINCT FROM OLD.external_id ) THEN RAISE EXCEPTION 'message_delivery_payload_immutable' USING ERRCODE = '42501'; END IF; RETURN NEW; end; $rb$;
--   revoke all on function public.guard_message_delivery_internal_fields() from public, anon, authenticated, service_role;
--
-- Item: varredor das mensagens presas em 'sending' + motivo no claim vazio +
-- claim por papel (supervisor/admin).
--
-- DEFEITO 1 (linha presa): `claim_outbound_message` so casa com linha que tenha
-- conexao `connected`, telefone normalizado valido e sem lease vivo. Quando o
-- claim volta vazio, o chamador (Edge `message-delivery`) apenas responde 409 e
-- NADA muda na tabela: a linha fica 'sending' para SEMPRE. Se o Edge nao roda
-- (nenhum poller) a linha tambem nunca e reivindicada. O varredor fecha essa
-- ponta: 'sending' sem lease vivo ha mais de p_min_age_seconds vira 'failed'.
--
-- DEFEITO 2 (claim vazio mudo): no claim vazio por bloqueio deterministico
-- (sem conexao conectada, telefone invalido) nao havia como gravar o motivo. A
-- RPC `fail_outbound_unclaimed` decide o motivo NO BANCO (o chamador nao
-- informa) e marca a linha 'failed', devolvendo-a com `delivery_failure_reason`
-- preenchido — e o que o cartao irmao da Edge (t_ea8decbb) precisa chamar.
--
-- DEFEITO 3 (claim por papel): supervisor/admin ativo nao conseguia despachar
-- a linha presa de outro agente (R2/FQ1) porque o claim exigia
-- `message.agent_id = p_agent_id`. Agora um profile admin/supervisor ativo
-- despacha a linha de qualquer agente.
--
-- NATUREZA: ADITIVA. Nova coluna + CHECK, uma tabela nova (append-only) e
-- CREATE OR REPLACE de 3 funcoes. Nenhum DROP de objeto existente, nenhum dado
-- tocado no momento do apply (o varredor so muda linhas quando roda). A coluna
-- nova entra no guard `guard_message_delivery_internal_fields` para o
-- authenticated nao poder forjar o motivo.
--
-- NAO REENVIA: o varredor e o fail_outbound_unclaimed so levam a linha para
-- 'failed'; nunca de volta a 'sending', nunca tocam `external_id`. O motivo
-- 'nao_despachada' e tambem o nome do estado — a mensagem nao foi despachada.
--
-- ESCOPO DA PROVA (nao toco o banco real): nada aqui foi conferido no banco de
-- producao. O inventario das linhas presas (idade/agente/contato) e uma
-- leitura contra producao — proibida para agente pela REGRA R1. A consulta
-- fica documentada em supabase/tests/outbound_sweeper_e_claim_por_papel.sql
-- para um humano com acesso a rodar.
--
-- DECISOES DO REFAZER 1 (cartao t_55a0bf18, sobre a entrega a03db8ad0):
-- P1 (Edge): o contrato que a Edge message-delivery chama no claim vazio e
-- `public.fail_outbound_unclaimed(p_message_id uuid, p_agent_id uuid)
-- RETURNS public.messages` (so service_role; motivo decidido no banco).
-- Consumidora: cartao t_ea8decbb ("no claim vazio ... via RPC do PD-78"),
-- cujo comentario traz a assinatura copiada. Nenhum codigo aqui muda por P1.
-- P2/P3 (cadencia e bandas): `*/5 * * * *`, padroes (900 s, lote 200) e bandas
-- (60..86400 s, lote 1..1000) foram decididos NESTE cartao sob o pedido
-- t_bc890f8a ("faca o varredor"), sem cartao dono de numero: 5 min e
-- conservador frente ao lease (30..300 s) e 900 s evita varrer linha que
-- o poller da Edge ainda pode retomar. Cobertos pelo teste (T7).
-- P4 (motivo por linha): o varredor decide o motivo com a MESMA regra do
-- fail_outbound_unclaimed; linha com POST iniciado NAO e varrida (dono da
-- Edge via fail_outbound_unclaimed, cartao t_ea8decbb). Cobertos (T3/T4/T5).
-- MERGE PD-79: claim e guard partem dos corpos de 20261013210004 (recusa de
-- POST iniciado + lease vencido; carimbo protegido) e SOMAM papel e motivo.
-- O rollback restaura os corpos de 20261013210004, nao os de 202609092x.

-- ============ 1. motivo da falha na propria linha ============
alter table public.messages
  add column if not exists delivery_failure_reason text;

alter table public.messages
  add constraint messages_delivery_failure_reason_check
  check (
    delivery_failure_reason is null
    or delivery_failure_reason in ('nao_despachada', 'sem_conexao', 'telefone_invalido')
  ) not valid;
alter table public.messages
  validate constraint messages_delivery_failure_reason_check;

-- ============ 2. evento da falha (append-only, so service_role) ============
-- Cada linha e o "evento" da transicao para 'failed'. NAO guarda conteudo,
-- telefone nem token — so a referencia e o motivo.
create table if not exists public.outbound_delivery_events (
  id uuid not null default gen_random_uuid() primary key,
  message_id uuid not null references public.messages(id) on delete cascade,
  contact_id uuid,
  agent_id uuid,
  reason text not null
    check (reason in ('nao_despachada', 'sem_conexao', 'telefone_invalido')),
  attempt_count integer not null default 0,
  lease_expired boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_outbound_delivery_events_message
  on public.outbound_delivery_events (message_id, created_at desc);

-- Log interno de entrega: nenhum usuario final le ou escreve. RLS ligada + a
-- trava de tabela (GRANT) — mesmo desenho de ai_usage_outbox.
alter table public.outbound_delivery_events enable row level security;

drop policy if exists outbound_delivery_events_service_role
  on public.outbound_delivery_events;
create policy outbound_delivery_events_service_role
  on public.outbound_delivery_events
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.outbound_delivery_events from public;
revoke all on public.outbound_delivery_events from anon;
revoke all on public.outbound_delivery_events from authenticated;
grant all on public.outbound_delivery_events to service_role;

-- ============ 3. varredor das linhas presas ============
-- So o dono/cron executa (ACL abaixo). Nao chama nada de fora alem do proprio
-- outbound_delivery_events. Conservador: exige sender='agent', status='sending',
-- external_id nulo, client_message_id presente, SEM lease vivo
-- (token nulo ou expirado), SEM POST iniciado (delivery_post_started_at nulo:
-- resultado ambiguo e dono da Edge, via fail_outbound_unclaimed — cartao
-- t_ea8decbb) e o ultimo toque (expiracao do lease ou updated_at) mais antigo
-- que p_min_age_seconds. Nunca reenvia: so grava 'failed'. O MOTIVO e decidido
-- por linha com a MESMA regra do fail_outbound_unclaimed (telefone_invalido,
-- sem_conexao, senao nao_despachada); contato ausente conta como
-- nao_despachada, igual ao fail_outbound_unclaimed.
create or replace function public.sweep_stale_outbound_sending(
  p_min_age_seconds integer default 900,
  p_limit integer default 200
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_count integer := 0;
begin
  if p_min_age_seconds is null or p_min_age_seconds not between 60 and 86400 then
    raise exception 'invalid_outbound_sweep_min_age' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'invalid_outbound_sweep_limit' using errcode = '22023';
  end if;

  with candidate as materialized (
    select message.id,
           (message.delivery_claimed_at is not null) as lease_expired,
           case
             when contact.id is null then 'nao_despachada'
             when regexp_replace(coalesce(contact.phone, ''), '\D', '', 'g')
                    !~ '^[0-9]{8,15}$' then 'telefone_invalido'
             when not exists (
               select 1
               from public.whatsapp_connections as connection
               where connection.id = coalesce(
                       message.whatsapp_connection_id,
                       contact.whatsapp_connection_id)
                 and connection.status = 'connected'
                 and nullif(connection.instance_id, '') is not null
             ) then 'sem_conexao'
             else 'nao_despachada'
           end as reason
    from public.messages as message
    left join public.contacts as contact on contact.id = message.contact_id
    where message.sender = 'agent'
      and message.status = 'sending'
      and message.external_id is null
      and message.client_message_id is not null
      and message.delivery_post_started_at is null
      and (message.delivery_claim_token is null
        or message.delivery_claim_expires_at <= statement_timestamp())
      and coalesce(message.delivery_claim_expires_at, message.updated_at)
            <= statement_timestamp() - make_interval(secs => p_min_age_seconds)
    order by message.updated_at, message.id
    for update of message skip locked
    limit p_limit
  ),
  swept as (
    update public.messages as message
    set status = 'failed',
        status_updated_at = statement_timestamp(),
        delivery_failure_reason = candidate.reason,
        delivery_claim_token = null,
        delivery_claimed_at = null,
        delivery_claim_expires_at = null,
        delivery_claimed_by = null,
        updated_at = statement_timestamp()
    from candidate
    where message.id = candidate.id
    returning message.id, message.contact_id, message.agent_id,
              message.delivery_attempt_count
  ),
  logged as (
    insert into public.outbound_delivery_events
      (message_id, contact_id, agent_id, reason, attempt_count, lease_expired)
    select swept.id, swept.contact_id, swept.agent_id, candidate.reason,
           swept.delivery_attempt_count, candidate.lease_expired
    from swept
    join candidate on candidate.id = swept.id
    returning 1
  )
  select count(*) into v_count from logged;

  return v_count;
end;
$function$;

revoke all on function public.sweep_stale_outbound_sending(integer, integer)
  from public, anon, authenticated, service_role;

-- ============ 4. RPC do claim vazio: marca 'failed' com motivo ============
-- O Edge chama quando `claim_outbound_message` volta vazio. So grava quando a
-- linha e realmente despachavel-e-bloqueada (sender='agent', 'sending',
-- external_id nulo) e NAO tem lease vivo. Idempotente. O motivo e decidido
-- aqui (telefone invalido -> sem conexao conectada -> generico), nunca pelo
-- chamador. Mesma regra de papel do claim: dono ou admin/supervisor ativo.
create or replace function public.fail_outbound_unclaimed(
  p_message_id uuid,
  p_agent_id uuid
) returns public.messages
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_message public.messages%rowtype;
  v_privileged boolean := false;
  v_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_message_id is null or p_agent_id is null then
    raise exception 'invalid_delivery_failure' using errcode = '22023';
  end if;

  select * into v_message
  from public.messages as message
  where message.id = p_message_id
  for update;
  if not found then
    raise exception 'outbound_message_not_found' using errcode = 'P0002';
  end if;

  select (profile.role in ('admin', 'supervisor')
          and coalesce(profile.is_active, false))
    into v_privileged
  from public.profiles as profile
  where profile.id = p_agent_id;

  if not (v_message.agent_id = p_agent_id or coalesce(v_privileged, false)) then
    raise exception 'outbound_message_not_found' using errcode = 'P0002';
  end if;

  -- idempotente: ja marcada por esta via
  if v_message.status = 'failed'
     and v_message.delivery_failure_reason is not null
     and v_message.delivery_claim_token is null
     and v_message.delivery_last_claim_token is null then
    return v_message;
  end if;

  -- nunca pisa em tentativa viva
  if v_message.delivery_claim_token is not null
     and v_message.delivery_claim_expires_at > statement_timestamp() then
    raise exception 'outbound_delivery_claim_live' using errcode = '42501';
  end if;

  if v_message.sender is distinct from 'agent'
     or v_message.status is distinct from 'sending'
     or v_message.external_id is not null then
    raise exception 'outbound_message_not_pending' using errcode = 'P0002';
  end if;

  select case
           when regexp_replace(coalesce(contact.phone, ''), '\D', '', 'g')
                  !~ '^[0-9]{8,15}$' then 'telefone_invalido'
           when not exists (
             select 1
             from public.whatsapp_connections as connection
             where connection.id = coalesce(
                     v_message.whatsapp_connection_id,
                     contact.whatsapp_connection_id)
               and connection.status = 'connected'
               and nullif(connection.instance_id, '') is not null
           ) then 'sem_conexao'
           else 'nao_despachada'
         end
    into v_reason
  from public.contacts as contact
  where contact.id = v_message.contact_id;
  if v_reason is null then
    v_reason := 'nao_despachada';
  end if;

  update public.messages as message
  set status = 'failed',
      status_updated_at = statement_timestamp(),
      delivery_failure_reason = v_reason,
      delivery_claim_token = null,
      delivery_claimed_at = null,
      delivery_claim_expires_at = null,
      delivery_claimed_by = null,
      updated_at = statement_timestamp()
  where message.id = p_message_id
  returning * into v_message;

  insert into public.outbound_delivery_events
    (message_id, contact_id, agent_id, reason, attempt_count, lease_expired)
  values (v_message.id, v_message.contact_id, v_message.agent_id, v_reason,
          v_message.delivery_attempt_count,
          v_message.delivery_last_claim_token is not null);

  return v_message;
end;
$function$;

revoke all on function public.fail_outbound_unclaimed(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fail_outbound_unclaimed(uuid, uuid)
  to service_role;

-- ============ 5. claim por papel (supervisor/admin ativo) ============
-- Base de 20261013210004 (com a recusa PD-79 de POST iniciado + lease vencido),
-- so com o lookup de papel: `message.agent_id = p_agent_id` vira
-- "(= p_agent_id) OR (ator admin/supervisor ativo)". A autorizacao de contato
-- ja foi imposta no enqueue; o claim e o passo de transporte de uma linha ja
-- enfileirada.
create or replace function public.claim_outbound_message(
  p_message_id uuid,
  p_agent_id uuid,
  p_worker text,
  p_lease_seconds integer default 90
) returns table (
  message_id uuid,
  client_message_id uuid,
  contact_id uuid,
  agent_id uuid,
  content text,
  message_type text,
  media_url text,
  caption text,
  media_filename text,
  media_mimetype text,
  reply_to_id uuid,
  reply_external_id text,
  whatsapp_connection_id uuid,
  whatsapp_instance_name text,
  contact_phone text,
  claim_token uuid,
  claim_expires_at timestamptz,
  delivery_attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_privileged boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_message_id is null or p_agent_id is null
     or p_worker is null or p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     or p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid_delivery_claim' using errcode = '22023';
  end if;

  select (profile.role in ('admin', 'supervisor')
          and coalesce(profile.is_active, false))
    into v_privileged
  from public.profiles as profile
  where profile.id = p_agent_id;

  return query
  with candidate as (
    select message.id, connection.id as resolved_connection_id
    from public.messages as message
    join public.contacts as contact on contact.id = message.contact_id
    join public.whatsapp_connections as connection
      on connection.id = coalesce(
        message.whatsapp_connection_id, contact.whatsapp_connection_id
      )
     and connection.status = 'connected'
     and nullif(connection.instance_id, '') is not null
    where message.id = p_message_id
      and (message.agent_id = p_agent_id or coalesce(v_privileged, false))
      and message.sender = 'agent'
      and message.status = 'sending'
      and message.external_id is null
      and message.client_message_id is not null
      and regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$'
      and (message.delivery_claim_token is null
        or message.delivery_claim_expires_at <= statement_timestamp())
      -- PD-79 (de 20261013210004): POST ja iniciado + lease vencido = resultado
      -- ambiguo. NAO reivindica: sem reenvio cego (a linha vai para 'verificar').
      and not (
        message.delivery_post_started_at is not null
        and message.delivery_claim_expires_at is not null
        and message.delivery_claim_expires_at <= statement_timestamp()
      )
    for update of message skip locked
  ), claimed as (
    update public.messages as message
    set delivery_claim_token = gen_random_uuid(),
        delivery_claimed_at = statement_timestamp(),
        delivery_claim_expires_at = statement_timestamp()
          + make_interval(secs => p_lease_seconds),
        delivery_claimed_by = p_worker,
        delivery_attempt_count = message.delivery_attempt_count + 1,
        whatsapp_connection_id = candidate.resolved_connection_id,
        updated_at = statement_timestamp()
    from candidate
    where message.id = candidate.id
    returning message.*
  )
  select claimed.id, claimed.client_message_id, claimed.contact_id,
         claimed.agent_id, claimed.content, claimed.message_type,
         claimed.media_url, claimed.caption, claimed.media_filename,
         claimed.media_mimetype, claimed.reply_to_id, reply.external_id,
         claimed.whatsapp_connection_id, connection.instance_id,
         regexp_replace(contact.phone, '\D', '', 'g'), claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  from claimed
  join public.contacts as contact on contact.id = claimed.contact_id
  join public.whatsapp_connections as connection
    on connection.id = claimed.whatsapp_connection_id
  left join public.messages as reply on reply.id = claimed.reply_to_id;
end;
$function$;

revoke all on function public.claim_outbound_message(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_outbound_message(uuid, uuid, text, integer)
  to service_role;

-- ============ 6. guard: delivery_failure_reason e campo interno ============
-- Base de 20261013210004 (que ja protege delivery_post_started_at), so com
-- delivery_failure_reason somado aos campos internos (INSERT proibido / UPDATE
-- imutavel para o authenticated). Sem isso o authenticated poderia forjar o
-- motivo da falha; sem o post_started (que estava aqui antes) haveria
-- regressao do PD-79.
create or replace function public.guard_message_delivery_internal_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if (tg_op = 'INSERT' and (
        new.client_message_id is not null
        or new.delivery_claim_token is not null
        or new.delivery_claimed_at is not null
        or new.delivery_claim_expires_at is not null
        or new.delivery_claimed_by is not null
        or new.delivery_last_claim_token is not null
        or new.delivery_attempt_count <> 0
        or new.delivery_post_started_at is not null
        or new.delivery_failure_reason is not null
      ))
     or (tg_op = 'UPDATE' and (
        new.client_message_id is distinct from old.client_message_id
        or new.delivery_claim_token is distinct from old.delivery_claim_token
        or new.delivery_claimed_at is distinct from old.delivery_claimed_at
        or new.delivery_claim_expires_at is distinct from old.delivery_claim_expires_at
        or new.delivery_claimed_by is distinct from old.delivery_claimed_by
        or new.delivery_last_claim_token is distinct from old.delivery_last_claim_token
        or new.delivery_attempt_count is distinct from old.delivery_attempt_count
        or new.delivery_post_started_at is distinct from old.delivery_post_started_at
        or new.delivery_failure_reason is distinct from old.delivery_failure_reason
      )) then
    raise exception 'message_delivery_internal_fields_forbidden'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.client_message_id is not null
     and old.status = 'sending'
     and old.external_id is null
     and (
       new.contact_id is distinct from old.contact_id
       or new.agent_id is distinct from old.agent_id
       or new.sender is distinct from old.sender
       or new.content is distinct from old.content
       or new.message_type is distinct from old.message_type
       or new.media_url is distinct from old.media_url
       or new.caption is distinct from old.caption
       or new.media_filename is distinct from old.media_filename
       or new.media_mimetype is distinct from old.media_mimetype
       or new.media_type is distinct from old.media_type
       or new.media_size is distinct from old.media_size
       or new.media_meta is distinct from old.media_meta
       or new.ptt is distinct from old.ptt
       or new.reply_to_id is distinct from old.reply_to_id
       or new.whatsapp_connection_id is distinct from old.whatsapp_connection_id
       or new.status is distinct from old.status
       or new.status_updated_at is distinct from old.status_updated_at
       or new.external_id is distinct from old.external_id
     ) then
    raise exception 'message_delivery_payload_immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_message_delivery_internal_fields()
  from public, anon, authenticated, service_role;

-- ============ 7. agendamento (idempotente) ============
select cron.unschedule(jobid)
from cron.job
where jobname = 'sweep-stale-outbound-sending';

select cron.schedule(
  'sweep-stale-outbound-sending',
  '*/5 * * * *',
  $$select public.sweep_stale_outbound_sending();$$
);
