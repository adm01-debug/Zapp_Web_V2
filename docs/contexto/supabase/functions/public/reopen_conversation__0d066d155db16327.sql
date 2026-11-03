CREATE OR REPLACE FUNCTION public.reopen_conversation(p_contact_id uuid)
 RETURNS TABLE(contact_id uuid, conversation_status text, conversation_status_changed_at timestamp with time zone, event_id uuid, reopened boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_profile_id uuid; begin
  if v_role not in ('authenticated', 'service_role') then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_contact_id is null then
    raise exception 'invalid_reopen_request' using errcode = '22023';
  end if;

  if v_role = 'authenticated' then
    if auth.uid() is null then
      raise exception 'contact_not_authorized' using errcode = '42501';
    end if;

    select profile.id into v_profile_id
    from public.profiles as profile
    where profile.user_id = auth.uid() and profile.is_active = true
    limit 1
    for share;
    if v_profile_id is null then
      raise exception 'active_profile_not_found' using errcode = '42501';
    end if;

    -- Mesmo erro para contato inexistente e sem permissão (sem oráculo).
    if public.is_contact_visible_to_user(p_contact_id, auth.uid()) is not true then
      raise exception 'contact_not_authorized' using errcode = '42501';
    end if;
  end if;

  return query select * from public.reopen_conversation_core(p_contact_id, v_profile_id);
end;
$function$
