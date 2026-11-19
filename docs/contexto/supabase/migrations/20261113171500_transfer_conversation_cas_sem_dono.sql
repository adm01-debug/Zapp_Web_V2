BEGIN

SET LOCAL lock_timeout = '5s'

SET LOCAL statement_timeout = '60s'

DO $pre$
BEGIN
  IF to_regprocedure('public.transfer_conversation(uuid, uuid, uuid, text, uuid)') IS NULL
     AND to_regprocedure('public.transfer_conversation(uuid, uuid, uuid, text, uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: transfer_conversation de 5 argumentos ausente — aplique 20261113130100 antes';
  END IF;
END
$pre$

DROP FUNCTION IF EXISTS public.transfer_conversation(uuid, uuid, uuid, text, uuid)

CREATE OR REPLACE FUNCTION public.transfer_conversation(
  p_contact_id uuid,
  p_to_agent_id uuid default null,
  p_to_queue_id uuid default null,
  p_note text default null,
  p_expected_agent_id uuid default null,
  p_expect_unassigned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  if p_expect_unassigned and p_expected_agent_id is not null then
    raise exception 'transfer_conversation: use p_expected_agent_id OU p_expect_unassigned, nao os dois.'
      using errcode = '22023';
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
  -- Compare-and-set de "sem dono": a tela viu a conversa SEM atendente; se alguém
  -- assumiu nesse meio-tempo, aborta em vez de tirar a conversa dessa pessoa.
  if p_expect_unassigned and v_from_agent is not null then
    raise exception 'Contato ja foi assumido por outro atendente.'
      using errcode = '40001';
  end if;

  -- P1-3: status acompanha o dono. Fila sem dono = aguardando; agente = em atendimento.
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

revoke all on function public.transfer_conversation(uuid, uuid, uuid, text, uuid, boolean) from public, anon

grant execute on function public.transfer_conversation(uuid, uuid, uuid, text, uuid, boolean) to authenticated, service_role

comment on function public.transfer_conversation(uuid, uuid, uuid, text, uuid, boolean) is
  'R2-INB-009 item 88 + PK-03 + P0-3/P1-3 + revisão #3037: ÚNICA versão. Transferência atômica (UPDATE contacts + INSERT conversation_events). Fila libera o contato e open->waiting; agente mantém a fila e waiting->open. Compare-and-set: p_expected_agent_id (dono esperado) ou p_expect_unassigned (esperava sem dono) -> 40001 se mudou. SECURITY DEFINER com can_edit_contact; service_role livre.'

DO $post$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'transfer_conversation';
  IF v_count <> 1 OR to_regprocedure('public.transfer_conversation(uuid, uuid, uuid, text, uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'pos-condicao: esperado 1 transfer_conversation de 6 argumentos, ha %', v_count;
  END IF;
END
$post$

COMMIT
