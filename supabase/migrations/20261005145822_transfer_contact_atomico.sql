-- transfer_contact_atomico
-- Rollback: DROP FUNCTION IF EXISTS public.transfer_contact(uuid, text, uuid, text);
--           CREATE OR REPLACE FUNCTION public.log_assignment_change() com o corpo
--           original de supabase/migrations/20260409100431_b1be1682-6494-4659-a9f4-6290237840fc.sql
--           (sem o early-return de app.transfer_contact_rpc).

-- ============================================================================
-- P1 #88 (R2-INB-009) — transferencia de conversa ATOMICA.
--
-- Defeito: a sidebar fazia UPDATE public.contacts (assigned_to/queue_id) e,
-- numa SEGUNDA chamada, INSERT em conversation_events. Duas consequencias:
--   (1) nao atomico: se o INSERT falha, o contato ja mudou de dono e o evento
--       nao existe (estado inconsistente, convite a transferir de novo);
--   (2) a policy de INSERT de conversation_events exige que o contato pertenca
--       ao chamador (assigned_to = meu profile) — como o UPDATE ja trocou o
--       dono, o INSERT do proprio autor era NEGADO pela RLS para usuario
--       authenticated comum.
--
-- Esta RPC faz as duas escritas numa UNICA transacao e reimplementa, de forma
-- explicita, a MESMA autorizacao que a RLS de UPDATE de contacts aplica
-- (can_edit_contact). Destino restrito a 'agent' | 'queue' (sem 'connection').
-- A nota opcional vai para conversation_events.metadata.note, com
-- event_type='transfer' e destino em to_agent_id (agente) ou to_queue_id (fila).
-- Qualquer erro levanta excecao e desfaz TUDO (o contato nao muda).
--
-- SECURITY DEFINER e necessario porque a escrita do evento tem de ser atomica
-- com a troca de dono; a autorizacao equivalente a RLS e feita explicitamente
-- no corpo e a funcao e concedida so a authenticated/service_role.
--
-- O trigger legado trg_log_assignment_change (AFTER UPDATE de contacts) tambem
-- grava um conversation_events por conta propria. Nesta transacao ele e
-- suprimido pela marca app.transfer_contact_rpc para o evento canonico (com a
-- nota) ser UNICO — nunca dois eventos para a mesma transferencia.
-- ============================================================================

create or replace function public.transfer_contact(
  p_contact_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_contact public.contacts%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_event_id uuid;
begin
  if v_profile_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_target_type is null or p_target_type not in ('agent', 'queue') then
    raise exception 'invalid_transfer_target' using errcode = '22023';
  end if;
  if p_target_id is null then
    raise exception 'invalid_transfer_target' using errcode = '22023';
  end if;

  select * into v_contact
    from public.contacts
   where id = p_contact_id
   for update;
  if not found then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;

  -- Mesma autorizacao da policy de UPDATE de contacts.
  if not public.can_edit_contact(
       v_contact.assigned_to,
       v_contact.queue_id,
       (select array_agg(v.v) from public.get_visible_agent_ids(auth.uid()) v(v)),
       v_profile_id,
       public.is_admin_or_supervisor(auth.uid())
     ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Marca transacional: o trigger legado de log nao duplica o evento.
  perform set_config('app.transfer_contact_rpc', 'on', true);

  if p_target_type = 'agent' then
    update public.contacts set assigned_to = p_target_id where id = p_contact_id;
  else
    update public.contacts set queue_id = p_target_id where id = p_contact_id;
  end if;

  insert into public.conversation_events (
    contact_id, event_type, performed_by,
    from_agent_id, from_queue_id, to_agent_id, to_queue_id, metadata
  ) values (
    p_contact_id, 'transfer', v_profile_id,
    v_contact.assigned_to, v_contact.queue_id,
    case when p_target_type = 'agent' then p_target_id end,
    case when p_target_type = 'queue' then p_target_id end,
    case when v_note is not null then jsonb_build_object('note', v_note) end
  ) returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'event_id', v_event_id,
    'target_type', p_target_type,
    'target_id', p_target_id
  );
end;
$$;

revoke all on function public.transfer_contact(uuid, text, uuid, text) from public, anon;
grant execute on function public.transfer_contact(uuid, text, uuid, text) to authenticated;
grant execute on function public.transfer_contact(uuid, text, uuid, text) to service_role;

comment on function public.transfer_contact(uuid, text, uuid, text) is
  'P1 #88: transferencia atomica de conversa (UPDATE contacts + INSERT conversation_events na mesma transacao). Destino agent|queue; nota opcional em metadata.note; erro levanta excecao e desfaz tudo.';

-- ============================================================================
-- Trigger legado: nao duplicar o evento quando a mudanca veio da RPC acima.
-- Corpo original copiado de
-- supabase/migrations/20260409100431_b1be1682-6494-4659-a9f4-6290237840fc.sql
-- sem alteracao alem do early-return por app.transfer_contact_rpc.
-- ============================================================================
create or replace function public.log_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  -- P1 #88: quando a mudanca vem da RPC atomica transfer_contact, a propria RPC
  -- grava o evento canonico (com a nota); este trigger nao duplica.
  if current_setting('app.transfer_contact_rpc', true) = 'on' then
    return new;
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    insert into public.conversation_events (
      contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata
    ) values (
      new.id,
      case
        when old.assigned_to is null then 'assign'
        when new.assigned_to is null then 'unassign'
        else 'transfer'
      end,
      old.assigned_to,
      new.assigned_to,
      coalesce(new.assigned_to, old.assigned_to),
      jsonb_build_object('old_queue', old.queue_id, 'new_queue', new.queue_id)
    );
  end if;

  -- Log queue changes
  if old.queue_id is distinct from new.queue_id then
    insert into public.conversation_events (
      contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata
    ) values (
      new.id,
      'queue_transfer',
      old.queue_id,
      new.queue_id,
      new.assigned_to,
      jsonb_build_object('agent', new.assigned_to)
    );
  end if;

  return new;
end;
$$;
