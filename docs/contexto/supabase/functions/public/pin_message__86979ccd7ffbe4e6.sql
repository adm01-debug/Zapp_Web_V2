CREATE OR REPLACE FUNCTION public.pin_message(p_message_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_contact uuid;
  v_pin_id  uuid;
  v_count   integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select m.contact_id into v_contact
  from public.messages m
  where m.id = p_message_id
    and public.is_contact_visible_to_user(m.contact_id, v_user);

  if v_contact is null then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  select id into v_pin_id
  from public.message_pins
  where contact_id = v_contact and message_id = p_message_id;

  if v_pin_id is not null then
    return v_pin_id;  -- idempotente: fixar de novo devolve o mesmo id
  end if;

  -- trava por conversa: o limite de 3 nao pode ser furado por dois chamadores
  perform pg_advisory_xact_lock(hashtextextended(v_contact::text, 0));

  select count(*) into v_count
  from public.message_pins
  where contact_id = v_contact;

  if v_count >= 3 then
    raise exception 'pin_limit_reached' using errcode = '23514';
  end if;

  insert into public.message_pins (contact_id, message_id, pinned_by)
  values (v_contact, p_message_id, v_user)
  returning id into v_pin_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (v_user, 'message_pinned', 'message', p_message_id,
          jsonb_build_object('contact_id', v_contact, 'pin_id', v_pin_id));

  return v_pin_id;
end;
$function$
