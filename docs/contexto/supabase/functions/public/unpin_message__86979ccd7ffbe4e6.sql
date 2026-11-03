CREATE OR REPLACE FUNCTION public.unpin_message(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_contact uuid;
  v_removed integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select m.contact_id into v_contact
  from public.messages m
  where m.id = p_message_id;

  if v_contact is null or not public.is_contact_visible_to_user(v_contact, v_user) then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  delete from public.message_pins
  where contact_id = v_contact and message_id = p_message_id;
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
    values (v_user, 'message_unpinned', 'message', p_message_id,
            jsonb_build_object('contact_id', v_contact));
  end if;

  return v_removed > 0;
end;
$function$
