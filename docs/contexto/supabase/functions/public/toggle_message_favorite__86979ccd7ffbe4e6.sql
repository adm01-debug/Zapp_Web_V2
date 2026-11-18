CREATE OR REPLACE FUNCTION public.toggle_message_favorite(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_removed integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and public.is_contact_visible_to_user(m.contact_id, v_user)
  ) then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  delete from public.message_favorites
  where user_id = v_user and message_id = p_message_id;
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    return false;
  end if;

  insert into public.message_favorites (user_id, message_id)
  values (v_user, p_message_id);

  return true;
end;
$function$
