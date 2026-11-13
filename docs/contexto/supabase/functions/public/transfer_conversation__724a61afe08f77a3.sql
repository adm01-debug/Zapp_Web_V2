CREATE OR REPLACE FUNCTION public.transfer_conversation(p_contact_id uuid, p_to_agent_id uuid DEFAULT NULL::uuid, p_to_queue_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_expected_agent_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_from_agent uuid;
  v_from_queue uuid;
  v_from_status text;
  v_next_status text;
  v_event_id uuid;
  v_jwt_role text;
begin
  v_jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  if v_jwt_role <> 'service_role' and auth.uid() is null then
    raise exception 'Sem sessao autenticada.' using errcode = 'insufficient_privilege';
  end if;
  if p_contact_id is null then
    raise exception 'transfer_conversation: p_contact_id obrigatorio' using errcode = '22023';
  end if;
  if (p_to_agent_id is null) = (p_to_queue_id is null) then
    raise exception 'transfer_conversation: informe exatamente um destino (p_to_agent_id ou p_to_queue_id).'
      using errcode = '22023';
  end if;
  select c.assigned_to, c.queue_id, c.conversation_status
    into v_from_agent, v_from_queue, v_from_status
    from public.contacts c
   where c.id = p_contact_id
   for update;
  if not found then
    raise exception 'Contato nao encontrado ou sem permissao para transferir.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_jwt_role <> 'service_role'
     and not public.can_edit_contact(v_from_agent, v_from_queue) then
    raise exception 'Contato nao encontrado ou sem permissao para transferir.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_expected_agent_id is not null
     and v_from_agent is distinct from p_expected_agent_id then
    raise exception 'Contato ja foi transferido por outro atendente.'
      using errcode = '40001';
  end if;
  v_next_status := case
    when p_to_queue_id is not null and v_from_status = 'open' then 'waiting'
    when p_to_agent_id is not null and v_from_status = 'waiting' then 'open'
    else v_from_status
  end;
  update public.contacts c
     set assigned_to         = p_to_agent_id,
         queue_id            = coalesce(p_to_queue_id, c.queue_id),
         conversation_status = v_next_status
   where c.id = p_contact_id;
  insert into public.conversation_events
    (contact_id, event_type, from_agent_id, from_queue_id,
     to_agent_id, to_queue_id, performed_by, metadata)
  values
    (p_contact_id, 'transfer', v_from_agent, v_from_queue,
     p_to_agent_id, p_to_queue_id,
     public.get_profile_id_for_user(auth.uid()),
     jsonb_build_object('note', p_note,
                        'from_status', v_from_status,
                        'to_status', v_next_status))
  returning id into v_event_id;
  return v_event_id;
end;
$function$
