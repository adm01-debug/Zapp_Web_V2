-- transfer_conversation_rpc
-- Rollback: DROP FUNCTION IF EXISTS public.transfer_conversation(uuid, uuid, uuid, text);
--   A função é nova e o único chamador é o ChatPanel deste cartão; ao derrubá-la o app volta a
--   falhar a chamada (erro exibido no diálogo) e nenhum dado é removido ou alterado.

-- ============================================================================
-- R2-INB-009 / item 88 (refazer 2): transferência de conversa ATÔMICA.
--
-- Antes desta migration o ChatPanel fazia duas escritas soltas: UPDATE em
-- contacts e INSERT em conversation_events. Se o INSERT falhava (RLS do evento
-- exige que o contato ainda esteja atribuído ao executor — depois do UPDATE ele
-- já não está), a transferência ficava gravada MESMO com erro na UI: estado
-- inconsistente e nova tentativa possível. A função abaixo executa as duas
-- escritas dentro de UMA transação implícita do Postgres: qualquer falha
-- (validação, autorização, trigger de hijack, INSERT do evento) desfaz o UPDATE.
--
-- Autorização: a função é SECURITY DEFINER mas aplica o MESMO predicado da
-- policy de UPDATE "Users can update their assigned contacts"
-- (public.can_edit_contact): admin/supervisor, agente com visibilidade do
-- contato ou membro ativo da fila atual. Usuários autenticados continuam
-- passando pelos triggers trg_prevent_contact_{queue,assignee}_hijack no UPDATE
-- interno (o trigger enxerga o JWT da requisição, não o dono da função).
-- service_role (Edge Functions internas) roteia livremente — mesmo critério
-- que esses triggers já usam.
--
-- Contrato: exatamente UM destino (p_to_agent_id XOR p_to_queue_id). A nota
-- opcional vai para conversation_events.metadata.note. Retorna o id do evento.
-- ============================================================================

drop function if exists public.transfer_conversation(uuid, uuid, uuid, text);

create function public.transfer_conversation(
  p_contact_id uuid,
  p_to_agent_id uuid default null,
  p_to_queue_id uuid default null,
  p_note text default null
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

  -- Autenticação: sessão de usuário autenticado ou service_role.
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
   where c.id = p_contact_id;

  if not found then
    raise exception 'Contato nao encontrado ou sem permissao para transferir.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_jwt_role <> 'service_role'
     and not public.can_edit_contact(v_from_agent, v_from_queue) then
    raise exception 'Contato nao encontrado ou sem permissao para transferir.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.contacts c
     set assigned_to = coalesce(p_to_agent_id, c.assigned_to),
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
$function$;

revoke all on function public.transfer_conversation(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.transfer_conversation(uuid, uuid, uuid, text) to authenticated, service_role;

comment on function public.transfer_conversation(uuid, uuid, uuid, text) is
  'R2-INB-009 item 88: transferência atômica de conversa — UPDATE em contacts + INSERT em conversation_events na mesma transação (se o evento falha, o contato não muda). SECURITY DEFINER com o mesmo predicado da policy de UPDATE de contacts (can_edit_contact); service_role livre. Retorna o id do evento gravado.';
