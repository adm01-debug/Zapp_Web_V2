CREATE OR REPLACE FUNCTION public.handle_inbound_message_reopen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
