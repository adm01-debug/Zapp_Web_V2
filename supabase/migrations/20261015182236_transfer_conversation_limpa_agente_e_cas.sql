-- transfer_conversation_limpa_agente_e_cas
-- Rollback: dropa a versão nova de transfer_conversation (5 args) e recria a versão anterior (4 args) com o corpo anterior, os GRANTs e o COMMENT originais.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.transfer_conversation(uuid, uuid, uuid, text, uuid);
--   create function public.transfer_conversation(p_contact_id uuid, p_to_agent_id uuid default null, p_to_queue_id uuid default null, p_note text default null) returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$ declare v_from_agent uuid; v_from_queue uuid; v_event_id uuid; v_jwt_role text; begin v_jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''); if v_jwt_role <> 'service_role' and auth.uid() is null then raise exception 'Sem sessao autenticada.' using errcode = 'insufficient_privilege'; end if; if p_contact_id is null then raise exception 'transfer_conversation: p_contact_id obrigatorio' using errcode = '22023'; end if; if (p_to_agent_id is null) = (p_to_queue_id is null) then raise exception 'transfer_conversation: informe exatamente um destino (p_to_agent_id ou p_to_queue_id).' using errcode = '22023'; end if; select c.assigned_to, c.queue_id into v_from_agent, v_from_queue from public.contacts c where c.id = p_contact_id; if not found then raise exception 'Contato nao encontrado ou sem permissao para transferir.' using errcode = 'insufficient_privilege'; end if; if v_jwt_role <> 'service_role' and not public.can_edit_contact(v_from_agent, v_from_queue) then raise exception 'Contato nao encontrado ou sem permissao para transferir.' using errcode = 'insufficient_privilege'; end if; update public.contacts c set assigned_to = coalesce(p_to_agent_id, c.assigned_to), queue_id = coalesce(p_to_queue_id, c.queue_id) where c.id = p_contact_id; insert into public.conversation_events (contact_id, event_type, from_agent_id, from_queue_id, to_agent_id, to_queue_id, performed_by, metadata) values (p_contact_id, 'transfer', v_from_agent, v_from_queue, p_to_agent_id, p_to_queue_id, public.get_profile_id_for_user(auth.uid()), jsonb_build_object('note', p_note)) returning id into v_event_id; return v_event_id; end; $function$;
--   revoke all on function public.transfer_conversation(uuid, uuid, uuid, text) from public, anon;
--   grant execute on function public.transfer_conversation(uuid, uuid, uuid, text) to authenticated, service_role;
--   comment on function public.transfer_conversation(uuid, uuid, uuid, text) is 'R2-INB-009 item 88: transferência atômica de conversa — UPDATE em contacts + INSERT em conversation_events na mesma transação (se o evento falha, o contato não muda). SECURITY DEFINER com o mesmo predicado da policy de UPDATE de contacts (can_edit_contact); service_role livre. Retorna o id do evento gravado.';
--
-- PK-03 (cartão t_893a2849) — dois defeitos de contrato na RPC de transferência
-- criada em 20261005185729, ambos visíveis na tela do inbox:
--
--   (a) DESTINO FILA deixava o dono antigo preso ao contato. O UPDATE usava
--       `assigned_to = coalesce(p_to_agent_id, c.assigned_to)`: com destino fila
--       (p_to_agent_id NULL) o valor antigo era mantido, então o contato ia para
--       a fila AINDA atribuído ao atendente anterior — a fila não via a conversa
--       como livre e o novo atendente não a recebia.
--   (b) Corrida de transferência. A leitura do dono atual e o UPDATE não eram
--       protegidos: dois atendentes transferindo o mesmo contato ao mesmo tempo
--       (o segundo com a tela já velha) passavam os dois e o último sobrescrevia
--       o primeiro em silêncio.
--
-- CORREÇÃO (aditiva; mesmos nomes de parâmetro, mesmo retorno, um parâmetro novo
-- opcional no fim):
--   1) destino fila: `assigned_to = p_to_agent_id`, que é NULL quando o destino é
--      fila — a conversa volta a ficar livre na fila. Destino agente: igual a
--      antes, `assigned_to = p_to_agent_id`, e `queue_id` mantém a fila atual
--      (coalesce), como no contrato anterior.
--      O gatilho de fila (on_contact_queue_auto_assign → auto_assign_to_queue_agent)
--      NÃO interfere: ele é BEFORE INSERT (migration 20260315172343), não dispara
--      neste UPDATE — o teste T2b prova que assigned_to fica NULL de verdade.
--   2) compare-and-set: `p_expected_agent_id uuid default null` no fim. Se vier
--      preenchido e o dono atual do contato for DIFERENTE dele, a função aborta
--      com 40001 (serialization_failure) sem escrever nada. A leitura do contato
--      passa a usar `for update`: sob READ COMMITTED, dois transfers simultâneos
--      serializam e o segundo relê o dono já trocado, falhando o CAS em vez de
--      sobrescrever.
--      Nada mais mudou: as validações de sessão/destino, o predicado de
--      autorização (can_edit_contact), os gatilhos de hijack e o evento de
--      transferência (com metadata.note) continuam iguais.
--
-- Assinatura: `drop function` antes do `create` é obrigatório. Um parâmetro a
-- mais com default cria OUTRA função (overload) em vez de substituir a antiga, e
-- as chamadas de 4 argumentos ficariam ambíguas entre as duas. O contrato para os
-- chamadores atuais não muda: todos usam argumentos nomeados
-- (src/components/inbox/ChatPanel.tsx e RealtimeCollaboration.tsx), e
-- p_expected_agent_id fica com default NULL.

drop function if exists public.transfer_conversation(uuid, uuid, uuid, text);

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

  -- `for update`: trava a linha lida. Sem ela, dois transfers simultâneos leem o
  -- mesmo dono antigo, os dois passam pelo compare-and-set e o segundo sobrescreve
  -- o primeiro em silêncio (READ COMMITTED).
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

  -- Compare-and-set: o chamador informa o dono que ele viu na tela. Se o contato
  -- já mudou de mão, aborta sem escrever nada (nem contato, nem evento).
  if p_expected_agent_id is not null
     and v_from_agent is distinct from p_expected_agent_id then
    raise exception 'Contato ja foi transferido por outro atendente.'
      using errcode = '40001';
  end if;

  -- Destino agente: assigned_to = alvo, queue_id mantém a fila atual.
  -- Destino fila: p_to_agent_id é NULL, então assigned_to fica NULL — a conversa
  -- fica livre na fila (era aqui que o dono antigo ficava preso).
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
$function$;

revoke all on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) to authenticated, service_role;

comment on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) is
  'R2-INB-009 item 88 + PK-03: transferência atômica de conversa — UPDATE em contacts + INSERT em conversation_events na mesma transação (se o evento falha, o contato não muda). Destino fila libera o contato (assigned_to = NULL); destino agente mantém a fila atual. p_expected_agent_id faz compare-and-set do dono (40001 se o contato já mudou de mão), com a linha travada por FOR UPDATE. SECURITY DEFINER com o mesmo predicado da policy de UPDATE de contacts (can_edit_contact); service_role livre. Retorna o id do evento gravado.';
