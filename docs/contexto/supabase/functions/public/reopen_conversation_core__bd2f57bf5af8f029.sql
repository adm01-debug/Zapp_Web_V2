CREATE OR REPLACE FUNCTION public.reopen_conversation_core(p_contact_id uuid, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contact_id uuid, conversation_status text, conversation_status_changed_at timestamp with time zone, event_id uuid, reopened boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
