CREATE OR REPLACE FUNCTION public.report_message(p_message_id uuid, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user    uuid := auth.uid();
  v_contact uuid;
  v_note    text;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_reason is null or p_reason not in ('spam', 'improprio', 'urgencia', 'outro') then
    raise exception 'invalid_report_reason' using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_report_note' using errcode = '22023';
  end if;

  select m.contact_id into v_contact
  from public.messages m
  where m.id = p_message_id
    and public.is_contact_visible_to_user(m.contact_id, v_user);

  if v_contact is null then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  insert into public.message_reports (message_id, reporter_id, reason, note)
  values (p_message_id, v_user, p_reason, v_note)
  on conflict (message_id, reporter_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- ja havia relato deste usuario para esta mensagem: devolve o existente
    select id into v_id
    from public.message_reports
    where message_id = p_message_id and reporter_id = v_user;
  else
    insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
    values (v_user, 'message_reported', 'message', p_message_id,
            jsonb_build_object('report_id', v_id, 'reason', p_reason));
  end if;

  return v_id;
end;
$function$
