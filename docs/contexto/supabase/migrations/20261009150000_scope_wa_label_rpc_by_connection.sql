drop function if exists public . rename_wa_label_on_all_contacts ( text , text )

drop function if exists public . remove_wa_label_from_all_contacts ( text )

create or replace function public . rename_wa_label_on_all_contacts ( p_connection_id uuid , p_label_prefix text , p_new_tag text ) returns void language plpgsql security definer set search_path to 'public' , 'pg_temp' as $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE whatsapp_connection_id = p_connection_id
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$

revoke execute on function public . rename_wa_label_on_all_contacts ( uuid , text , text ) from public

grant execute on function public . rename_wa_label_on_all_contacts ( uuid , text , text ) to authenticated , service_role

create or replace function public . remove_wa_label_from_all_contacts ( p_connection_id uuid , p_label_prefix text ) returns void language plpgsql security definer set search_path to 'public' , 'pg_temp' as $function$
BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  PERFORM public.require_contact_global_admin();

  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE whatsapp_connection_id = p_connection_id
    AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END;
$function$

revoke execute on function public . remove_wa_label_from_all_contacts ( uuid , text ) from public

grant execute on function public . remove_wa_label_from_all_contacts ( uuid , text ) to authenticated , service_role
