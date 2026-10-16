-- reabre_conversa_com_nova_mensagem
-- Rollback: dropa o gatilho e as três funções criadas; o estado das conversas fica como está (a reabertura é efeito de dado, sem marca própria).
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_conversation_reopen_on_inbound on public.messages;
--   drop function if exists public.handle_inbound_message_reopen();
--   drop function if exists public.reopen_conversation(uuid);
--   drop function if exists public.reopen_conversation_core(uuid, uuid);
--
-- R2-INB-035: conversa resolvida/arquivada não reabria sozinha quando o cliente voltava a
-- escrever — o atendente só via a resposta nova no histórico de um contato fora da inbox.
--
-- A correção tem 3 partes:
--   1. reopen_conversation_core(contact_id, performed_by): núcleo travado por FOR UPDATE,
--      sem checagem de chamador (interno). Reabre SÓ contato ativo (não soft-deleted) em
--      'resolved'/'archived' para 'waiting' (sem responsável) ou 'open' (com responsável),
--      seguindo o FSM canônico: resolved/archived não vão direto a 'waiting', então a
--      transição é feita em dois passos (-> open e, se for o caso, -> waiting). Idempotente:
--      contato já ativo devolve reopened=false e NÃO grava evento.
--   2. reopen_conversation(contact_id): RPC do botão. Mesmas guardas do close_conversation_atomic
--      (papel authenticated/service_role, perfil ativo, is_contact_visible_to_user) ANTES de
--      qualquer efeito. Erro/resposta iguais para contato inexistente e sem permissão.
--   3. Gatilho AFTER INSERT em public.messages (sender='contact', não deletada) chama o núcleo,
--      cobrindo TODOS os caminhos de entrada (webhook/ingest/Edge) — não só a RPC de ingest.
--
-- Evento: conversation_events event_type='reopen' (sem texto de mensagem e sem PII),
-- com previous_status/destination no metadata. Uma operação atômica: se o evento falhar,
-- nada (nem a mudança de estado) persiste.
--
-- Gatilhos da cadeia: contacts possui o FSM enforce_conversation_status_transition (BEFORE
-- UPDATE) e log_assignment_change (não dispara: assigned_to não muda), além de
-- update_contacts_updated_at. messages possui trg_sicoob_reply e trg_gamification_on_message_sent
-- (indiferentes a mensagem de contato sem agent_id). Nada disso é desligado.
--
-- Aplicada depois do merge (classe contrato).

create or replace function public.reopen_conversation_core(
  p_contact_id uuid,
  p_performed_by uuid default null
) returns table(
  contact_id uuid,
  conversation_status text,
  conversation_status_changed_at timestamptz,
  event_id uuid,
  reopened boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_status text;
  v_assigned uuid;
  v_deleted timestamptz;
  v_dest text;
  v_changed_at timestamptz;
  v_event_id uuid; begin
  if p_contact_id is null then
    raise exception 'invalid_reopen_request' using errcode = '22023';
  end if;

  select contact.conversation_status,
         contact.assigned_to,
         contact.deleted_at
    into v_status, v_assigned, v_deleted
  from public.contacts as contact
  where contact.id = p_contact_id
  for update;

  if not found then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;

  -- No-op idempotente: contato soft-deleted ou já ativo não reabre nem grava evento.
  if v_deleted is not null or v_status is null or v_status not in ('resolved', 'archived') then
    select contact.conversation_status_changed_at into v_changed_at
    from public.contacts as contact where contact.id = p_contact_id;
    return query select p_contact_id, v_status, v_changed_at, null::uuid, false;
    return;
  end if;

  v_dest := case when v_assigned is null then 'waiting' else 'open' end;

  -- Passo 1: resolved/archived só alcançam estado ativo por 'open' (FSM canônico).
  update public.contacts as contact
     set conversation_status = 'open'
   where contact.id = p_contact_id
   returning contact.conversation_status_changed_at into v_changed_at;

  -- Passo 2: sem responsável, o estado canônico do FSM é 'waiting' (Aguardando, W1/W2).
  if v_dest = 'waiting' then
    update public.contacts as contact
       set conversation_status = 'waiting'
     where contact.id = p_contact_id
     returning contact.conversation_status_changed_at into v_changed_at;
  end if;

  insert into public.conversation_events (contact_id, event_type, performed_by, metadata)
  values (
    p_contact_id,
    'reopen',
    p_performed_by,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_status', v_status,
      'destination', v_dest
    ))
  )
  returning id into v_event_id;

  return query select p_contact_id, v_dest, v_changed_at, v_event_id, true;
end;
$function$;

-- Núcleo interno: nunca executável pelo cliente.
revoke all on function public.reopen_conversation_core(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reopen_conversation_core(uuid, uuid) to service_role;

create or replace function public.reopen_conversation(p_contact_id uuid)
returns table(
  contact_id uuid,
  conversation_status text,
  conversation_status_changed_at timestamptz,
  event_id uuid,
  reopened boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_profile_id uuid; begin
  if v_role not in ('authenticated', 'service_role') then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_contact_id is null then
    raise exception 'invalid_reopen_request' using errcode = '22023';
  end if;

  if v_role = 'authenticated' then
    if auth.uid() is null then
      raise exception 'contact_not_authorized' using errcode = '42501';
    end if;

    select profile.id into v_profile_id
    from public.profiles as profile
    where profile.user_id = auth.uid() and profile.is_active = true
    limit 1
    for share;
    if v_profile_id is null then
      raise exception 'active_profile_not_found' using errcode = '42501';
    end if;

    -- Mesmo erro para contato inexistente e sem permissão (sem oráculo).
    if public.is_contact_visible_to_user(p_contact_id, auth.uid()) is not true then
      raise exception 'contact_not_authorized' using errcode = '42501';
    end if;
  end if;

  return query select * from public.reopen_conversation_core(p_contact_id, v_profile_id);
end;
$function$;

revoke all on function public.reopen_conversation(uuid) from public, anon;
grant execute on function public.reopen_conversation(uuid) to authenticated, service_role;

create or replace function public.handle_inbound_message_reopen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_status text;
  v_deleted timestamptz; begin
  -- Leitura sem trava (barata) só para evitar chamar o núcleo em todo inbound.
  select contact.conversation_status, contact.deleted_at
    into v_status, v_deleted
  from public.contacts as contact
  where contact.id = new.contact_id;

  if not found or v_deleted is not null or v_status not in ('resolved', 'archived') then
    return new;
  end if;

  -- O núcleo é autoritativo e trava a linha: corrida entre dois inbound reabre uma só vez.
  perform * from public.reopen_conversation_core(new.contact_id, null);
  return new;
end;
$function$;

revoke all on function public.handle_inbound_message_reopen() from public, anon, authenticated;

drop trigger if exists trg_conversation_reopen_on_inbound on public.messages;
create trigger trg_conversation_reopen_on_inbound
after insert on public.messages
for each row
when (new.sender = 'contact' and new.contact_id is not null and new.is_deleted is not true)
execute function public.handle_inbound_message_reopen();

comment on function public.reopen_conversation(uuid) is
  'Reabre conversa resolved/archived (botão "Reabrir"): waiting sem responsável, open com responsável.';
comment on function public.reopen_conversation_core(uuid, uuid) is
  'Núcleo interno da reabertura (FOR UPDATE, idempotente). Sem checagem de chamador.';
