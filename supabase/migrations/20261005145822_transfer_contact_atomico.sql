-- transfer_contact_atomico (v2 - corrigido apos a recusa do refazer 1)
-- Rollback: DROP FUNCTION IF EXISTS public.transfer_contact(uuid, text, uuid, text);
--           CREATE OR REPLACE FUNCTION public.log_assignment_change() com o corpo legado original
--           de supabase/migrations/20260409100431_b1be1682-6494-4659-a9f4-6290237840fc.sql,
--           sem o merge de app.transfer_note.
--
-- P1 #88 (R2-INB-009). Defeito REAL no base (medido): a nota opcional digitada no TransferDialog
-- nunca era persistida. O callback da sidebar chamava transferContact(contactId, tipo, targetId)
-- SEM a nota, e transferContact fazia so o UPDATE em contacts; o trigger log_assignment_change
-- gravava o evento na MESMA transacao (nao havia 'duas chamadas nao atomicas'), porem sem
-- metadata.note. Alem disso a sidebar fechava o dialogo mesmo quando o UPDATE falhava.
--
-- Correcao: UMA RPC public.transfer_contact(...) SECURITY INVOKER que valida tipo/id, publica a
-- nota num GUC transacional e faz o UPDATE. A autorizacao do DESTINO e a do proprio banco: a policy
-- de UPDATE de public.contacts tem USING = public.can_edit_contact(...) e, sem WITH CHECK proprio, o
-- USING vale tambem como WITH CHECK da linha NOVA; e os triggers BEFORE UPDATE
-- trg_prevent_contact_assignee_hijack / trg_prevent_contact_queue_hijack continuam validando
-- agente/fila de destino. Nada disso e reimplementado aqui -> equivalencia exata com a RLS.
--
-- O evento e escrito UMA unica vez pelo trigger log_assignment_change (SECURITY DEFINER) - necessario
-- porque a policy de INSERT de conversation_events exige performed_by = chamador E contato ainda
-- atribuido ao chamador, o que deixa de valer assim que o UPDATE troca o dono. O trigger mantem os
-- event_type legados ('assign'/'unassign'/'transfer'/'queue_transfer'); a nota entra em metadata.note.

create or replace function public.transfer_contact(
  p_contact_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_found boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_target_type is null or p_target_type not in ('agent', 'queue') then
    raise exception 'invalid_transfer_target' using errcode = '22023';
  end if;
  if p_target_id is null then
    raise exception 'invalid_transfer_target' using errcode = '22023';
  end if;

  -- Canal transacional (is_local = true) para a nota chegar ao trigger de log, unico escritor do
  -- evento. Limpo logo apos o UPDATE.
  perform set_config('app.transfer_note', coalesce(v_note, ''), true);

  if p_target_type = 'agent' then
    update public.contacts set assigned_to = p_target_id where id = p_contact_id;
  else
    update public.contacts set queue_id = p_target_id where id = p_contact_id;
  end if;
  v_found := found;

  perform set_config('app.transfer_note', '', true);

  -- 0 linhas: contato inexistente ou fora do alcance do chamador (USING da policy de UPDATE).
  if not v_found then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'target_type', p_target_type,
    'target_id', p_target_id
  );
end;
$fn$;

comment on function public.transfer_contact(uuid, text, uuid, text) is
  'P1 #88: transferencia de conversa pela sidebar. SECURITY INVOKER: autorizacao do destino e a da RLS (policy de UPDATE de public.contacts) e a dos triggers de hijack; o evento unico, com metadata.note, e gravado pelo trigger log_assignment_change.';

revoke all on function public.transfer_contact(uuid, text, uuid, text) from public, anon;
grant execute on function public.transfer_contact(uuid, text, uuid, text) to authenticated;
grant execute on function public.transfer_contact(uuid, text, uuid, text) to service_role;

-- Trigger legado: unico escritor do evento. Mantem 100% os event_type e o metadata legado; acrescenta
-- apenas metadata.note quando app.transfer_note esta setado (transferencia via RPC).
create or replace function public.log_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $tg$
declare
  v_note text := nullif(btrim(current_setting('app.transfer_note', true)), '');
begin
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
        || case when v_note is not null then jsonb_build_object('note', v_note) else '{}'::jsonb end
    );
  end if;

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
        || case when v_note is not null then jsonb_build_object('note', v_note) else '{}'::jsonb end
    );
  end if;

  return new;
end;
$tg$;
