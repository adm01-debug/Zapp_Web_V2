drop function if exists public.transfer_conversation(uuid, uuid, uuid, text)

create function public.transfer_conversation(
  p_contact_id uuid,
  p_to_agent_id uuid default null,
  p_to_queue_id uuid default null,
  p_note text default null,
  p_expected_agent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_from_agent uuid;
  v_from_queue uuid;
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

  select c.assigned_to, c.queue_id
    into v_from_agent, v_from_queue
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

  update public.contacts c
     set assigned_to = p_to_agent_id,
         queue_id    = coalesce(p_to_queue_id, c.queue_id)
   where c.id = p_contact_id;

  insert into public.conversation_events
    (contact_id, event_type, from_agent_id, from_queue_id,
     to_agent_id, to_queue_id, performed_by, metadata)
  values
    (p_contact_id, 'transfer', v_from_agent, v_from_queue,
     p_to_agent_id, p_to_queue_id,
     public.get_profile_id_for_user(auth.uid()),
     jsonb_build_object('note', p_note))
  returning id into v_event_id;

  return v_event_id;
end;
$function$

revoke all on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) from public, anon

grant execute on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) to authenticated, service_role

comment on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) is
  'R2-INB-009 item 88 + PK-03: transferência atômica de conversa — UPDATE em contacts + INSERT em conversation_events na mesma transação (se o evento falha, o contato não muda). Destino fila libera o contato (assigned_to = NULL); destino agente mantém a fila atual. p_expected_agent_id faz compare-and-set do dono (40001 se o contato já mudou de mão), com a linha travada por FOR UPDATE. SECURITY DEFINER com o mesmo predicado da policy de UPDATE de contacts (can_edit_contact); service_role livre. Retorna o id do evento gravado.'
