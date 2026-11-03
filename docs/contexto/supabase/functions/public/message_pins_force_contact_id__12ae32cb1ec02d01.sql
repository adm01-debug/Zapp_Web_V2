CREATE OR REPLACE FUNCTION public.message_pins_force_contact_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_contact uuid;
begin
  select m.contact_id into v_contact
  from public.messages m
  where m.id = new.message_id;

  if v_contact is null then
    raise exception 'message_without_contact' using errcode = '22023';
  end if;

  new.contact_id := v_contact;
  return new;
end;
$function$
